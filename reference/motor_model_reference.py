"""
Electric Motor Lab: physics reference (TECH_SPEC.md §6, §7).

This file is the source of truth for every number the page shows. The TypeScript code in
src/physics is a line-by-line port and is tested against reference/vectors.json, which this
script writes.

Models
  §6.2  IPM synchronous machine, amplitude-invariant dq model, electrical speed w_e = p w_m
  §6.3  Induction machine, steady-state rotor-flux-oriented dq model
  §6.4  Loss model: stator copper (temperature + AC factor), rotor copper, iron (Steinmetz
        hysteresis + eddy), magnet eddy, mechanical, inverter (SiC), gearbox
  §6.2/6.3  Minimum-loss operating-point solver with current and voltage limits,
        torque envelopes T_max(rpm), T_min(rpm) (regen additionally limited to 150 kW DC)
  §6.5  Build-time maps (65 speeds x 169 torques) with bilinear lookup
  §6.8-6.10  Vehicle, battery, driver presets and 2-node thermal model, fixed step 1/240 s

Conventions
  Currents and voltages are dq PEAK values (amplitude-invariant transform): the phase current
  amplitude equals sqrt(id^2 + iq^2) and the phase-to-neutral voltage amplitude equals |v|.
  T means electromagnetic (air-gap) torque. Iron, magnet-eddy and mechanical losses act as a
  drag torque, so the shaft torque is T - (P_fe + P_mag + P_mech) / w_m.

Usage
  python reference/motor_model_reference.py            report + write reference/vectors.json
  python reference/motor_model_reference.py --quick    targets report only (no maps/scenarios)

numpy only. Deterministic.
"""

from __future__ import annotations

import json
import math
import sys
import time
from dataclasses import dataclass, field, asdict
from pathlib import Path

import numpy as np

TAU = 2.0 * math.pi
RPM = 30.0 / math.pi  # rad/s -> rpm
G0 = 9.81

# ---------------------------------------------------------------------------------------------
# Frozen parameters (tuned in Phase 1; mirrored in src/config/*.ts)
# ---------------------------------------------------------------------------------------------

VEHICLE = dict(
    mass_kg=1850.0,
    rot_inertia_frac=0.04,  # rotating inertia equivalent, fraction of mass
    cda_m2=0.23 * 2.22,
    rho_air=1.2,
    crr=0.009,
    wheel_radius_m=0.350,
    gear_ratio=9.0,
    gear_eff=0.975,
    mu=1.0,
    rear_static_share=0.55,
    cg_height_m=0.50,
    wheelbase_m=2.88,
    v_max_kmh=225.0,
    limiter_band_kmh=2.0,
)

BATTERY = dict(
    cells_series=96,
    ocv_min_cell_v=3.6,  # at SoC 0
    ocv_max_cell_v=4.15,  # at SoC 1
    r_pack_ohm=0.080,
    energy_kwh=60.0,
    charge_limit_w=150e3,
)

# The inverter maps are built at this DC-link voltage (§7.1 "battery at 380 V").
V_DC_NOM = 380.0
M_MAX = 0.95  # SVPWM linear range with margin
F_SW_HZ = 10e3
T_REF_C = 70.0  # winding temperature at which the maps are built (= oil temperature)
ALPHA_CU = 0.00393

# Mechanical losses (bearings + windage), shared by both machines: P = c_b w + c_w w^3
MECH = dict(c_b=0.070, c_w=1.10e-7)

# Inverter: SiC MOSFET conduction + switching, shared by both machines
INVERTER = dict(r_on_eff_ohm=1.5e-3, k_sw=3.0e-10)


@dataclass
class PMParams:
    """IPM synchronous machine (§6.2)."""

    p: int = 3
    psi_m: float = 0.0736  # Wb, magnet flux linkage (peak)
    l_d: float = 0.125e-3  # H
    l_q: float = 0.245e-3  # H
    r_s20: float = 7.0e-3  # Ohm at 20 C
    i_max: float = 860.0  # A peak
    f_ac_hz: float = 1200.0  # AC-resistance corner (hairpins)
    k_h: float = 190.0  # hysteresis: W per (Hz * Wb^2)
    k_e: float = 0.36  # eddy: W per (Hz^2 * Wb^2)
    k_mag: float = 2.0e-9  # magnet eddy: W per (Hz^2 * A^2)


@dataclass
class IMParams:
    """Induction machine with rotor-flux orientation (§6.3)."""

    p: int = 2
    l_m: float = 1.2e-3
    l_ls: float = 0.035e-3
    l_lr: float = 0.035e-3
    r_s20: float = 12.0e-3
    r_r: float = 8.5e-3
    i_max: float = 690.0
    i_d_rated: float = 166.0  # rated (saturation-limited) magnetizing current; i_d,min = 5 % of it
    f_ac_hz: float = 1200.0
    k_h: float = 250.0
    k_e: float = 0.65
    k_bar: float = 4.0  # display-only turns-ratio factor: I_bar = k_bar * |i_rq|


PM = PMParams()
IM = IMParams()

THERMAL = dict(
    c_w_j_per_k=4000.0,  # tuned from 6000 so ~7 back-to-back launches derate (§7.3)
    c_r_j_per_k=4000.0,
    t_oil_c=70.0,
    r_w_oil_k_per_w=0.025,  # tuned from 0.012 (same reason)
    r_r_oil_k_per_w=0.035,
    t_winding_limit_c=150.0,
    t_magnet_limit_c=140.0,
    derate_span_k=20.0,
    t_start_c=40.0,
)

DRIVER = dict(
    brake_max_g=0.4,
    regen_fade_kmh=8.0,
    cruise_kmh=110.0,
    cruise_kp=0.15,  # per km/h
    cruise_ki=0.02,  # per (km/h * s)
    launch_release_kmh=100.0,
    regen_decel_g=0.25,
    regen_start_kmh=120.0,
)

SIM_DT = 1.0 / 240.0

# Solver resolution (the TS port uses exactly the same numbers)
N_SAMPLES = 200  # samples along the constant-torque curve (N+1 points)
N_ENV = 400  # samples for the envelope search
N_GOLDEN = 32  # golden-section iterations
N_BISECT = 44


def v_max_of(v_dc: float) -> float:
    return M_MAX * v_dc / math.sqrt(3.0)


def r_of_temp(r20: float, temp_c: float) -> float:
    return r20 * (1.0 + ALPHA_CU * (temp_c - 20.0))


def mech_loss(w_m):
    return MECH["c_b"] * np.abs(w_m) + MECH["c_w"] * np.abs(w_m) ** 3


def inverter_loss(i_mag, v_dc=V_DC_NOM):
    return 1.5 * INVERTER["r_on_eff_ohm"] * i_mag**2 + INVERTER["k_sw"] * F_SW_HZ * v_dc * i_mag


# ---------------------------------------------------------------------------------------------
# Machine evaluation (vectorized over i_d, i_q)
# ---------------------------------------------------------------------------------------------


def pm_eval(m: PMParams, w_m: float, i_d, i_q, temp_c: float = T_REF_C) -> dict:
    """IPM at mechanical speed w_m (rad/s). §6.2, §6.4."""
    i_d = np.asarray(i_d, dtype=float)
    i_q = np.asarray(i_q, dtype=float)
    w_e = m.p * w_m
    r_s = r_of_temp(m.r_s20, temp_c)
    psi_d = m.l_d * i_d + m.psi_m
    psi_q = m.l_q * i_q
    v_d = r_s * i_d - w_e * psi_q
    v_q = r_s * i_q + w_e * psi_d
    torque = 1.5 * m.p * (m.psi_m * i_q + (m.l_d - m.l_q) * i_d * i_q)
    i2 = i_d**2 + i_q**2
    i_mag = np.sqrt(i2)
    f_e = abs(w_e) / TAU
    k_ac = 1.0 + (f_e / m.f_ac_hz) ** 2
    cu_dc = 1.5 * r_s * i2
    psi_s2 = psi_d**2 + psi_q**2
    return dict(
        torque=torque,
        v_d=v_d,
        v_q=v_q,
        v_mag=np.sqrt(v_d**2 + v_q**2),
        i_mag=i_mag,
        w_e=np.full_like(i_d, w_e),
        cu=cu_dc * k_ac,
        cu_dc=cu_dc,
        rcu=np.zeros_like(i_d),
        fe=(m.k_h * f_e + m.k_e * f_e**2) * psi_s2,
        mag=m.k_mag * f_e**2 * i2,
        inv=inverter_loss(i_mag),
        psi_s=np.sqrt(psi_s2),
    )


def im_consts(m: IMParams):
    l_s = m.l_m + m.l_ls
    l_r = m.l_m + m.l_lr
    sigma = 1.0 - m.l_m**2 / (l_s * l_r)
    k_t = 1.5 * m.p * m.l_m**2 / l_r
    return l_s, l_r, sigma, k_t


def im_eval(m: IMParams, w_m: float, i_d, i_q, temp_c: float = T_REF_C) -> dict:
    """Induction machine, rotor-flux-oriented steady state. §6.3, §6.4."""
    i_d = np.asarray(i_d, dtype=float)
    i_q = np.asarray(i_q, dtype=float)
    l_s, l_r, sigma, k_t = im_consts(m)
    r_s = r_of_temp(m.r_s20, temp_c)
    safe_id = np.where(i_d > 0, i_d, 1.0)
    w_sl = np.where(i_d > 0, m.r_r * i_q / (l_r * safe_id), 0.0)
    w_e = m.p * w_m + w_sl
    v_d = r_s * i_d - w_e * sigma * l_s * i_q
    v_q = r_s * i_q + w_e * l_s * i_d
    torque = k_t * i_d * i_q
    i2 = i_d**2 + i_q**2
    i_mag = np.sqrt(i2)
    f_e = np.abs(w_e) / TAU
    k_ac = 1.0 + (f_e / m.f_ac_hz) ** 2
    cu_dc = 1.5 * r_s * i2
    i_rq = -(m.l_m / l_r) * i_q
    psi_s2 = (l_s * i_d) ** 2 + (sigma * l_s * i_q) ** 2
    return dict(
        torque=torque,
        v_d=v_d,
        v_q=v_q,
        v_mag=np.sqrt(v_d**2 + v_q**2),
        i_mag=i_mag,
        w_e=w_e,
        w_sl=w_sl,
        cu=cu_dc * k_ac,
        cu_dc=cu_dc,
        rcu=1.5 * m.r_r * i_rq**2,
        fe=(m.k_h * f_e + m.k_e * f_e**2) * psi_s2,
        mag=np.zeros_like(i_d),
        inv=inverter_loss(i_mag),
        i_rq=i_rq,
        psi_s=np.sqrt(psi_s2),
    )


def evaluate(kind: str, w_m: float, i_d, i_q, temp_c: float = T_REF_C) -> dict:
    return pm_eval(PM, w_m, i_d, i_q, temp_c) if kind == "pm" else im_eval(IM, w_m, i_d, i_q, temp_c)


def params(kind: str):
    return PM if kind == "pm" else IM


def elec_loss(ev: dict):
    """Losses that depend on the current choice (the solver's objective)."""
    return ev["cu"] + ev["rcu"] + ev["fe"] + ev["mag"] + ev["inv"]


def violation(kind: str, ev: dict, v_max: float):
    m = params(kind)
    return np.maximum(ev["i_mag"] - m.i_max, 0.0) + np.maximum(ev["v_mag"] - v_max, 0.0)


# ---------------------------------------------------------------------------------------------
# Constant-torque curve: i_q as a function of i_d
# ---------------------------------------------------------------------------------------------


def id_range(kind: str):
    m = params(kind)
    if kind == "pm":
        return -m.i_max, 0.0
    # magnetizing current is capped at its rated value: beyond it the iron saturates
    return 0.05 * m.i_d_rated, m.i_d_rated


def iq_for_torque(kind: str, torque: float, i_d):
    i_d = np.asarray(i_d, dtype=float)
    if kind == "pm":
        m = PM
        return torque / (1.5 * m.p * (m.psi_m + (m.l_d - m.l_q) * i_d))
    _, _, _, k_t = im_consts(IM)
    return torque / (k_t * i_d)


def golden_min(f, a: float, b: float, n: int = N_GOLDEN) -> float:
    """Golden-section search for the minimum of f on [a, b]; returns the midpoint."""
    g = (math.sqrt(5.0) - 1.0) / 2.0
    c = b - g * (b - a)
    d = a + g * (b - a)
    fc = f(c)
    fd = f(d)
    for _ in range(n):
        if fc < fd:
            b, d, fd = d, c, fc
            c = b - g * (b - a)
            fc = f(c)
        else:
            a, c, fc = c, d, fd
            d = a + g * (b - a)
            fd = f(d)
    return 0.5 * (a + b)


# ---------------------------------------------------------------------------------------------
# Torque envelopes (§6.2, §6.3)
# ---------------------------------------------------------------------------------------------


def iq_limit(kind: str, w_m: float, i_d, sign: float, v_max: float):
    """
    Largest |i_q| with the given sign that satisfies both limits at each i_d.
    Returns NaN where even i_q = 0 violates the voltage limit.
    Bisection on the voltage (|v| is monotonic in i_q along one sign for both machines).
    """
    m = params(kind)
    i_d = np.asarray(i_d, dtype=float)
    iq_cur = np.sqrt(np.maximum(m.i_max**2 - i_d**2, 0.0))
    if kind == "pm":
        # |v|^2 <= V^2 is a quadratic a iq^2 + b iq + c <= 0 in i_q (closed form)
        r_s = r_of_temp(PM.r_s20, T_REF_C)
        w_e = PM.p * w_m
        psi_d = PM.l_d * i_d + PM.psi_m
        a = (w_e * PM.l_q) ** 2 + r_s**2
        b = 2.0 * r_s * w_e * (psi_d - PM.l_q * i_d)
        c = (r_s * i_d) ** 2 + (w_e * psi_d) ** 2 - v_max**2
        sq = np.sqrt(np.maximum(b * b - 4.0 * a * c, 0.0))
        if sign > 0:
            mag = np.minimum((-b + sq) / (2.0 * a), iq_cur)
        else:
            mag = np.minimum(-(-b - sq) / (2.0 * a), iq_cur)
        return np.where(c <= 0.0, sign * mag, np.nan)
    ev0 = evaluate(kind, w_m, i_d, np.zeros_like(i_d))
    ok0 = ev0["v_mag"] <= v_max
    evc = evaluate(kind, w_m, i_d, sign * iq_cur)
    okc = evc["v_mag"] <= v_max
    lo = np.zeros_like(i_d)
    hi = iq_cur.copy()
    for _ in range(N_BISECT):
        mid = 0.5 * (lo + hi)
        ok = evaluate(kind, w_m, i_d, sign * mid)["v_mag"] <= v_max
        lo = np.where(ok, mid, lo)
        hi = np.where(ok, hi, mid)
    mag = np.where(okc, iq_cur, lo)
    return np.where(ok0, sign * mag, np.nan)


@dataclass
class OpPoint:
    i_d: float
    i_q: float
    torque: float
    feasible: bool


def envelope_raw(kind: str, w_m: float, sign: float, v_max: float) -> OpPoint:
    """Maximum |T| with the given sign at speed w_m within current and voltage limits."""
    lo, hi = id_range(kind)
    ids = np.linspace(lo, hi, N_ENV + 1)
    iqs = iq_limit(kind, w_m, ids, sign, v_max)
    t = evaluate(kind, w_m, ids, np.nan_to_num(iqs))["torque"] * sign
    t = np.where(np.isnan(iqs), -np.inf, t)
    k = int(np.argmax(t))
    if not np.isfinite(t[k]):
        return OpPoint(0.0, 0.0, 0.0, False)
    a = ids[max(k - 1, 0)]
    b = ids[min(k + 1, N_ENV)]

    def neg_t(x: float) -> float:
        iq = iq_limit(kind, w_m, np.array([x]), sign, v_max)[0]
        if np.isnan(iq):
            return math.inf
        return -sign * float(evaluate(kind, w_m, np.array([x]), np.array([iq]))["torque"][0])

    x = golden_min(neg_t, a, b)
    if neg_t(x) > -t[k]:
        x = ids[k]
    iq = float(iq_limit(kind, w_m, np.array([x]), sign, v_max)[0])
    tq = float(evaluate(kind, w_m, np.array([x]), np.array([iq]))["torque"][0])
    return OpPoint(float(x), iq, tq, True)


# ---------------------------------------------------------------------------------------------
# Minimum-loss operating point (§6.2, §6.3)
# ---------------------------------------------------------------------------------------------


def solve_on_curve(kind: str, w_m: float, torque: float, v_max: float, lo: float, hi: float):
    """Minimum loss along the constant-torque curve for i_d in [lo, hi]; None if infeasible."""
    ids = np.linspace(lo, hi, N_SAMPLES + 1)
    iqs = iq_for_torque(kind, torque, ids)
    ev = evaluate(kind, w_m, ids, iqs)
    viol = violation(kind, ev, v_max)
    feas = viol <= 0.0
    if not feas.any():
        return None
    loss = np.where(feas, elec_loss(ev), np.inf)
    k = int(np.argmin(loss))
    a = ids[max(k - 1, 0)]
    b = ids[min(k + 1, N_SAMPLES)]

    def f(x: float) -> float:
        e = evaluate(kind, w_m, np.array([x]), iq_for_torque(kind, torque, np.array([x])))
        return float(elec_loss(e)[0]) + 1e6 * float(violation(kind, e, v_max)[0])

    x = golden_min(f, a, b)
    ex = evaluate(kind, w_m, np.array([x]), iq_for_torque(kind, torque, np.array([x])))
    if float(violation(kind, ex, v_max)[0]) > 0.0:
        # pull back onto the feasible side of the limit (towards the feasible sample)
        good, bad = ids[k], x
        for _ in range(N_BISECT):
            mid = 0.5 * (good + bad)
            em = evaluate(kind, w_m, np.array([mid]), iq_for_torque(kind, torque, np.array([mid])))
            if float(violation(kind, em, v_max)[0]) > 0.0:
                bad = mid
            else:
                good = mid
        x = good
        ex = evaluate(kind, w_m, np.array([x]), iq_for_torque(kind, torque, np.array([x])))
    if float(elec_loss(ex)[0]) > loss[k]:
        x = ids[k]
    return float(x)


@dataclass
class Envelope:
    t_max: float
    t_min: float
    op_max: OpPoint
    op_min: OpPoint
    t_min_raw: float


def envelope(kind: str, w_m: float, v_max: float) -> Envelope:
    op_max = envelope_raw(kind, w_m, +1.0, v_max)
    op_min = envelope_raw(kind, w_m, -1.0, v_max)
    t_min = op_min.torque
    t_min_raw = op_min.torque
    # battery charge-power limit: P_dc >= -150 kW
    lim = -BATTERY["charge_limit_w"]
    if op_min.feasible and p_dc_of(kind, w_m, op_min.i_d, op_min.i_q) < lim:
        a, b = op_min.torque, 0.0  # P_dc(a) < lim <= P_dc(b)
        for _ in range(N_BISECT):
            mid = 0.5 * (a + b)
            x = solve(kind, w_m, mid, v_max, op_max, op_min)
            if p_dc_of(kind, w_m, x.i_d, x.i_q) < lim:
                a = mid
            else:
                b = mid
        t_min = b
        op_min = solve(kind, w_m, t_min, v_max, op_max, op_min)
        op_min = OpPoint(op_min.i_d, op_min.i_q, t_min, True)
    return Envelope(op_max.torque, t_min, op_max, op_min, t_min_raw)


def solve(kind: str, w_m: float, torque: float, v_max: float, op_max: OpPoint, op_min: OpPoint) -> OpPoint:
    """
    Minimum-loss (i_d, i_q) for electromagnetic torque `torque` at w_m.
    Infeasible torques return the envelope point with feasible = False.
    """
    if kind == "im" and torque == 0.0:
        return OpPoint(0.0, 0.0, 0.0, True)  # flux off: no field, no loss (§6.3)
    if torque >= op_max.torque:
        return OpPoint(op_max.i_d, op_max.i_q, op_max.torque, torque == op_max.torque)
    if torque <= op_min.torque:
        return OpPoint(op_min.i_d, op_min.i_q, op_min.torque, torque == op_min.torque)
    lo, hi = id_range(kind)
    x = solve_on_curve(kind, w_m, torque, v_max, lo, hi)
    if x is None:
        # close to the envelope: the feasible arc is narrower than the sample spacing
        env = op_max if torque > 0 else op_min
        span = 0.05 * (hi - lo)
        x = solve_on_curve(kind, w_m, torque, v_max, max(lo, env.i_d - span), min(hi, env.i_d + span))
    if x is None:
        return OpPoint(op_max.i_d if torque > 0 else op_min.i_d,
                       op_max.i_q if torque > 0 else op_min.i_q,
                       op_max.torque if torque > 0 else op_min.torque, False)
    return OpPoint(x, float(iq_for_torque(kind, torque, np.array([x]))[0]), torque, True)


def p_dc_of(kind: str, w_m: float, i_d: float, i_q: float) -> float:
    """DC power: P_dc = T w_m + P_cu + P_rcu + P_inv (iron/magnet/mech are drawn from the shaft)."""
    ev = evaluate(kind, w_m, np.array([i_d]), np.array([i_q]))
    return float(ev["torque"][0] * w_m + ev["cu"][0] + ev["rcu"][0] + ev["inv"][0])


def full_point(kind: str, w_m: float, op: OpPoint) -> dict:
    """Every derived quantity for an operating point (maps, vectors, report)."""
    ev = evaluate(kind, w_m, np.array([op.i_d]), np.array([op.i_q]))
    g = {k: float(v[0]) for k, v in ev.items()}
    torque = g["torque"]
    mech = float(mech_loss(w_m))
    p_em = torque * w_m
    p_shaft = p_em - g["fe"] - g["mag"] - mech
    p_dc = p_em + g["cu"] + g["rcu"] + g["inv"]
    if p_shaft > 0 and p_dc > 0:
        eff = p_shaft / p_dc
    elif p_shaft < 0 and p_dc < 0:
        eff = p_dc / p_shaft
    else:
        eff = 0.0
    if kind == "im":
        slip = g["w_sl"] / g["w_e"] if abs(g["w_e"]) > 1e-9 else 0.0
        if op.i_d == 0.0 and op.i_q == 0.0:
            slip = 0.0
    else:
        slip = 0.0
    return dict(
        i_d=op.i_d, i_q=op.i_q, torque=torque, v_d=g["v_d"], v_q=g["v_q"], v_mag=g["v_mag"],
        i_mag=g["i_mag"], w_e=g["w_e"], cu=g["cu"], rcu=g["rcu"], fe=g["fe"], mag=g["mag"],
        mech=mech, inv=g["inv"], p_shaft=p_shaft, p_dc=p_dc, eff=eff, slip=slip,
        feasible=op.feasible,
    )


# ---------------------------------------------------------------------------------------------
# Maps (§6.5)
# ---------------------------------------------------------------------------------------------

MAP_RPM = np.arange(0, 16000 + 1, 250, dtype=float)  # 65
MAP_T = np.arange(-420, 420 + 1, 5, dtype=float)  # 169
MAP_FIELDS = ["i_d", "i_q", "v_d", "v_q", "cu", "rcu", "fe", "mag", "inv", "eff", "slip", "feasible"]


def sig4(x: float) -> float:
    """Quantize to 4 significant digits (float32-safe), as stored in the JSON maps."""
    if x == 0.0 or not math.isfinite(x):
        return 0.0
    return float(f"{x:.4g}")


def build_map(kind: str, v_max: float) -> dict:
    n_r, n_t = len(MAP_RPM), len(MAP_T)
    fields = {f: np.zeros((n_r, n_t)) for f in MAP_FIELDS}
    t_max = np.zeros(n_r)
    t_min = np.zeros(n_r)
    for i, rpm in enumerate(MAP_RPM):
        w = rpm / RPM
        env = envelope(kind, w, v_max)
        t_max[i] = env.t_max
        t_min[i] = env.t_min
        for j, tq in enumerate(MAP_T):
            tc = min(max(tq, env.t_min), env.t_max)
            op = solve(kind, w, tc, v_max, env.op_max, env.op_min)
            fp = full_point(kind, w, op)
            for f in MAP_FIELDS:
                fields[f][i, j] = fp[f]
            fields["feasible"][i, j] = 1.0 if (env.t_min <= tq <= env.t_max and op.feasible) else 0.0
    return dict(t_max=t_max, t_min=t_min, fields=fields)


def quantize_map(mp: dict) -> dict:
    q = lambda a: np.vectorize(sig4)(a)  # noqa: E731
    return dict(
        t_max=q(mp["t_max"]),
        t_min=q(mp["t_min"]),
        fields={f: q(v) for f, v in mp["fields"].items()},
    )


def interp1(xs: np.ndarray, ys: np.ndarray, x: float) -> float:
    return float(np.interp(x, xs, ys))


class MapLookup:
    """Runtime bilinear lookup with the torque clamped to the envelope (§6.5)."""

    def __init__(self, mp: dict):
        self.mp = mp

    def t_max(self, rpm: float) -> float:
        return interp1(MAP_RPM, self.mp["t_max"], rpm)

    def t_min(self, rpm: float) -> float:
        return interp1(MAP_RPM, self.mp["t_min"], rpm)

    def lookup(self, rpm: float, torque: float) -> dict:
        rpm = min(max(rpm, MAP_RPM[0]), MAP_RPM[-1])
        tq = min(max(torque, self.t_min(rpm)), self.t_max(rpm))
        fi = (rpm - MAP_RPM[0]) / 250.0
        fj = (tq - MAP_T[0]) / 5.0
        i0 = min(int(math.floor(fi)), len(MAP_RPM) - 2)
        j0 = min(max(int(math.floor(fj)), 0), len(MAP_T) - 2)
        u = fi - i0
        v = fj - j0
        out = {"torque": tq}
        for f, arr in self.mp["fields"].items():
            out[f] = float(
                arr[i0, j0] * (1 - u) * (1 - v)
                + arr[i0 + 1, j0] * u * (1 - v)
                + arr[i0, j0 + 1] * (1 - u) * v
                + arr[i0 + 1, j0 + 1] * u * v
            )
        return out


# ---------------------------------------------------------------------------------------------
# Vehicle, battery, driver, thermal (§6.8-6.10)
# ---------------------------------------------------------------------------------------------


def ocv(soc: float) -> float:
    b = BATTERY
    return b["cells_series"] * (b["ocv_min_cell_v"] + (b["ocv_max_cell_v"] - b["ocv_min_cell_v"]) * soc)


def battery_current(p_dc: float, soc: float) -> tuple[float, float]:
    """Solve V = OCV - R I, P = V I for I (the physical root). Returns (I_dc, V_dc)."""
    e = ocv(soc)
    r = BATTERY["r_pack_ohm"]
    disc = e * e - 4.0 * r * p_dc
    if disc < 0.0:
        disc = 0.0  # beyond the maximum transferable power: clamp at OCV^2 / 4R
    i = (e - math.sqrt(disc)) / (2.0 * r)
    return i, e - r * i


def road_load(v: float) -> float:
    c = VEHICLE
    if v <= 0.0:
        return 0.0
    return c["crr"] * c["mass_kg"] * G0 + 0.5 * c["rho_air"] * c["cda_m2"] * v * v


def derate_factor(kind: str, t_w: float, t_r: float) -> float:
    th = THERMAL
    k = 1.0
    if t_w > th["t_winding_limit_c"]:
        k = min(k, 1.0 - 0.5 * min((t_w - th["t_winding_limit_c"]) / th["derate_span_k"], 1.0))
    if kind == "pm" and t_r > th["t_magnet_limit_c"]:
        k = min(k, 1.0 - 0.5 * min((t_r - th["t_magnet_limit_c"]) / th["derate_span_k"], 1.0))
    return k


@dataclass
class SimState:
    t: float = 0.0
    v: float = 0.0
    soc: float = 0.9
    t_w: float = THERMAL["t_start_c"]
    t_r: float = THERMAL["t_start_c"]
    accel: float = 0.0
    cruise_int: float = 0.0
    # energy book-keeping (§7.2 #9)
    e_dc: float = 0.0
    e_road: float = 0.0
    e_loss: float = 0.0
    e_fric: float = 0.0
    last: dict = field(default_factory=dict)


def sim_step(st: SimState, maps: dict, kind: str, throttle: float, brake: float, dt: float = SIM_DT) -> None:
    """One fixed step of vehicle + battery + thermal (§6.8-6.10)."""
    c = VEHICLE
    mp: MapLookup = maps[kind]
    m_eff = c["mass_kg"] * (1.0 + c["rot_inertia_frac"])
    g_r, eta, r_w = c["gear_ratio"], c["gear_eff"], c["wheel_radius_m"]
    v = st.v
    kmh = v * 3.6
    w_m = v * g_r / r_w
    rpm = w_m * RPM
    f_road = road_load(v)

    derate = derate_factor(kind, st.t_w, st.t_r)
    t_max = mp.t_max(rpm) * derate
    t_min = mp.t_min(rpm)

    # traction limit on the driven rear axle with longitudinal weight transfer
    f_z_rear = c["mass_kg"] * G0 * c["rear_static_share"] + c["mass_kg"] * st.accel * c["cg_height_m"] / c["wheelbase_m"]
    t_trac = c["mu"] * f_z_rear * r_w / (g_r * eta)

    # drag torque from spin losses at zero current (fades to 0 at standstill to avoid 0/0)
    fade_w = min(w_m / 1.0, 1.0)

    f_fric = 0.0
    if brake > 0.0:
        a_req = DRIVER["brake_max_g"] * G0 * brake
        f_need = max(m_eff * a_req - f_road, 0.0) if v > 0 else 0.0
        regen_fade = min(kmh / DRIVER["regen_fade_kmh"], 1.0)
        f_regen_req = f_need * regen_fade
        t_shaft_req = -f_regen_req * r_w * eta / g_r
        # first guess of drag from the zero-torque point, then one refinement at the target torque
        pt0 = mp.lookup(rpm, 0.0)
        t_drag = (pt0["fe"] + pt0["mag"] + MECH_LOSS(w_m)) / max(w_m, 1.0) * fade_w
        t_em = max(min(t_shaft_req + t_drag, 0.0), t_min)
        pt = mp.lookup(rpm, t_em)
        t_drag = (pt["fe"] + pt["mag"] + MECH_LOSS(w_m)) / max(w_m, 1.0) * fade_w
        t_em = max(min(t_shaft_req + t_drag, 0.0), t_min)
        pt = mp.lookup(rpm, t_em)
    else:
        t_cmd = throttle * t_max
        if kmh > c["v_max_kmh"]:
            t_cmd *= max(0.0, 1.0 - (kmh - c["v_max_kmh"]) / c["limiter_band_kmh"])
        t_em = min(t_cmd, t_trac)
        pt = mp.lookup(rpm, t_em)
    t_em = pt["torque"]
    p_mech = MECH_LOSS(w_m)
    p_drag = (pt["fe"] + pt["mag"] + p_mech) * fade_w
    p_em = t_em * w_m
    p_shaft = p_em - p_drag
    t_shaft = t_em - (p_drag / w_m if w_m > 1e-9 else 0.0)
    if t_shaft >= 0.0:
        f_motor = t_shaft * g_r * eta / r_w
    else:
        f_motor = t_shaft * g_r / (r_w * eta)
    p_wheel = f_motor * v
    p_gear = abs(p_wheel - p_shaft)

    if brake > 0.0 and v > 0.0:
        a_req = DRIVER["brake_max_g"] * G0 * brake
        f_need = max(m_eff * a_req - f_road, 0.0)
        f_fric = max(f_need + f_motor, 0.0)  # f_motor is negative when regenerating

    # copper loss at the current winding temperature (maps are built at T_REF_C)
    r_scale = (1.0 + ALPHA_CU * (st.t_w - 20.0)) / (1.0 + ALPHA_CU * (T_REF_C - 20.0))
    p_cu = pt["cu"] * r_scale
    p_dc = p_em + p_cu + pt["rcu"] + pt["inv"]
    i_dc, v_dc = battery_current(p_dc, st.soc)
    p_batt_loss = i_dc * i_dc * BATTERY["r_pack_ohm"]

    # integrate the vehicle (explicit Euler at 240 Hz)
    f_net = f_motor - f_road - f_fric
    if v <= 0.0 and f_net <= 0.0:
        a = 0.0
        v_new = 0.0
    else:
        a = f_net / m_eff
        v_new = v + a * dt
        if v_new < 0.0:
            v_new = 0.0
            a = -v / dt
    # energy book-keeping: DC energy = kinetic + road + friction brake + all losses
    v_avg = 0.5 * (v + v_new)
    st.e_dc += p_dc * dt
    st.e_road += f_road * v_avg * dt
    st.e_fric += f_fric * v_avg * dt
    st.e_loss += (p_cu + pt["rcu"] + pt["inv"] + p_drag + p_gear) * dt
    # correction for Euler: work done by the motor force at the step-average speed
    st.e_loss += f_motor * (v - v_avg) * dt

    # thermal (§6.10)
    th = THERMAL
    p_fe = pt["fe"] * fade_w
    dtw = (p_cu + 0.7 * p_fe - (st.t_w - th["t_oil_c"]) / th["r_w_oil_k_per_w"]) / th["c_w_j_per_k"]
    dtr = (pt["rcu"] + pt["mag"] * fade_w + 0.3 * p_fe - (st.t_r - th["t_oil_c"]) / th["r_r_oil_k_per_w"]) / th["c_r_j_per_k"]
    st.t_w += dtw * dt
    st.t_r += dtr * dt
    st.soc -= p_dc * dt / (BATTERY["energy_kwh"] * 3.6e6)
    st.v = v_new
    st.accel = a
    st.t += dt
    st.last = dict(
        kmh=kmh, rpm=rpm, t_em=t_em, t_shaft=t_shaft, p_dc=p_dc, p_shaft=p_shaft, i_dc=i_dc,
        v_dc=v_dc, derate=derate, i_d=pt["i_d"], i_q=pt["i_q"], slip=pt["slip"], f_fric=f_fric,
        p_batt_loss=p_batt_loss, t_trac=t_trac,
    )


def MECH_LOSS(w_m: float) -> float:  # noqa: N802 - scalar helper
    return float(mech_loss(w_m))


# ---------------------------------------------------------------------------------------------
# Scenarios (§6.9, §7.3)
# ---------------------------------------------------------------------------------------------


def scenario_launch(maps: dict, kind: str, soc: float = 1.0) -> dict:
    st = SimState(soc=soc)
    socs = [st.soc]
    t100 = None
    e_dc0 = 0.0
    while st.t < 20.0:
        sim_step(st, maps, kind, 1.0, 0.0)
        socs.append(st.soc)
        if st.v * 3.6 >= DRIVER["launch_release_kmh"]:
            t100 = st.t
            break
    ke = 0.5 * VEHICLE["mass_kg"] * (1 + VEHICLE["rot_inertia_frac"]) * st.v**2
    rhs = ke + st.e_road + st.e_loss + st.e_fric
    return dict(
        t_0_100_s=t100,
        soc_monotonic=bool(all(b <= a for a, b in zip(socs, socs[1:]))),
        energy_dc_j=st.e_dc - e_dc0,
        energy_rhs_j=rhs,
        energy_error_rel=abs(st.e_dc - rhs) / st.e_dc,
        t_winding_end_c=st.t_w,
    )


def scenario_top_speed(maps: dict, kind: str) -> dict:
    st = SimState(soc=1.0)
    kmh_max = 0.0
    while st.t < 120.0:
        sim_step(st, maps, kind, 1.0, 0.0)
        kmh_max = max(kmh_max, st.v * 3.6)
    return dict(top_kmh=st.v * 3.6, top_rpm=st.last["rpm"], kmh_max=kmh_max)


def cruise_pi(st: SimState, target_kmh: float, dt: float = SIM_DT) -> float:
    """PI speed hold (§6.9) with conditional-integration anti-windup; returns the throttle."""
    e = target_kmh - st.v * 3.6
    u_unsat = DRIVER["cruise_kp"] * e + DRIVER["cruise_ki"] * (st.cruise_int + e * dt)
    if 0.0 < u_unsat < 1.0:
        st.cruise_int += e * dt
    return min(max(DRIVER["cruise_kp"] * e + DRIVER["cruise_ki"] * st.cruise_int, 0.0), 1.0)


def scenario_cruise(maps: dict, kind: str) -> dict:
    st = SimState(soc=0.8, v=DRIVER["cruise_kmh"] / 3.6)
    e0 = 0.0
    d0 = 0.0
    for n in range(int(90.0 / SIM_DT)):
        u = cruise_pi(st, DRIVER["cruise_kmh"])
        sim_step(st, maps, kind, u, 0.0)
        if n == int(30.0 / SIM_DT):
            e0, d0 = st.e_dc, 0.0
        if n > int(30.0 / SIM_DT):
            d0 += st.v * SIM_DT
    kwh_100 = (st.e_dc - e0) / 3.6e6 / (d0 / 1e5)
    return dict(kmh=st.v * 3.6, kwh_per_100km=kwh_100, t_em=st.last["t_em"], p_dc=st.last["p_dc"],
                slip=st.last["slip"])


def scenario_regen(maps: dict, kind: str) -> dict:
    st = SimState(soc=0.7, v=DRIVER["regen_start_kmh"] / 3.6)
    brake = DRIVER["regen_decel_g"] / DRIVER["brake_max_g"]
    soc0 = st.soc
    p_regen_max = 0.0
    fric_below = []
    fric_above = []
    v_prev = st.v
    overshoot = False
    while st.t < 30.0 and st.v > 0.0:
        sim_step(st, maps, kind, 0.0, brake)
        p_regen_max = max(p_regen_max, -st.last["p_dc"])
        (fric_below if st.last["kmh"] < DRIVER["regen_fade_kmh"] else fric_above).append(st.last["f_fric"])
        if st.v > v_prev + 1e-12:
            overshoot = True
        v_prev = st.v
    return dict(
        stop_time_s=st.t,
        soc_gain=st.soc - soc0,
        p_regen_max_kw=p_regen_max / 1e3,
        fric_max_below_fade_n=max(fric_below) if fric_below else 0.0,
        fric_max_above_fade_n=max(fric_above) if fric_above else 0.0,
        v_end=st.v,
        overshoot=overshoot,
    )


def scenario_coast(maps: dict, kind: str) -> dict:
    """Spin loss at 100 km/h with zero current (§6.9 Coast, §7.1)."""
    w = 100 / 3.6 * VEHICLE["gear_ratio"] / VEHICLE["wheel_radius_m"]
    fp = maps[kind].lookup(w * RPM, 0.0)
    return dict(rpm=w * RPM, drag_w=fp["fe"] + fp["mag"] + MECH_LOSS(w), i_d=fp["i_d"], i_q=fp["i_q"])


def scenario_derate(maps: dict, kind: str, n: int = 10) -> dict:
    """n back-to-back launches (0-100) each followed by 0.25 g regen braking to a stop."""
    st = SimState(soc=0.9)
    first = None
    brake = DRIVER["regen_decel_g"] / DRIVER["brake_max_g"]
    t_w_max = st.t_w
    t_r_max = st.t_r
    for k in range(n):
        while st.v * 3.6 < DRIVER["launch_release_kmh"] and st.t < 1e4:
            sim_step(st, maps, kind, 1.0, 0.0)
            if first is None and st.last["derate"] < 1.0:
                first = k + 1
        while st.v > 0.0:
            sim_step(st, maps, kind, 0.0, brake)
            if first is None and st.last["derate"] < 1.0:
                first = k + 1
        t_w_max = max(t_w_max, st.t_w)
        t_r_max = max(t_r_max, st.t_r)
    return dict(first_derate_launch=first, t_winding_max_c=t_w_max, t_rotor_max_c=t_r_max,
                duration_s=st.t)


# ---------------------------------------------------------------------------------------------
# Targets (§7.1)
# ---------------------------------------------------------------------------------------------


def rpm_to_w(rpm: float) -> float:
    return rpm / RPM


def targets(kind: str, v_max: float) -> dict:
    """Machine-level targets computed directly from the solver (no maps)."""
    rpms = np.arange(0, 16000 + 1, 100, dtype=float)
    envs = [envelope(kind, rpm_to_w(r), v_max) for r in rpms]
    t_max = np.array([e.t_max for e in envs])
    t_peak = float(t_max[rpms == 1000][0])
    base = float(rpms[np.where(t_max >= 0.98 * t_peak)[0].max()])
    p_shaft = []
    for r, e in zip(rpms, envs):
        fp = full_point(kind, rpm_to_w(r), e.op_max)
        p_shaft.append(fp["p_shaft"])
    p_shaft = np.array(p_shaft)
    p_peak = float(p_shaft.max())
    p_15k = float(p_shaft[rpms == 15000][0])

    # peak efficiency over a coarse grid
    best = (0.0, 0, 0)
    for r in np.arange(1000, 15001, 500, dtype=float):
        w = rpm_to_w(r)
        env = envelope(kind, w, v_max)
        for tq in np.arange(20, env.t_max, 10.0):
            fp = full_point(kind, w, solve(kind, w, float(tq), v_max, env.op_max, env.op_min))
            if fp["feasible"] and fp["eff"] > best[0]:
                best = (fp["eff"], r, tq)

    # cruise 110 km/h: shaft torque that balances the road load
    v = 110 / 3.6
    w = v * VEHICLE["gear_ratio"] / VEHICLE["wheel_radius_m"]
    t_shaft = road_load(v) * VEHICLE["wheel_radius_m"] / (VEHICLE["gear_ratio"] * VEHICLE["gear_eff"])
    env = envelope(kind, w, v_max)
    t_em = t_shaft
    for _ in range(4):  # fixed-point on the drag torque
        fp = full_point(kind, w, solve(kind, w, t_em, v_max, env.op_max, env.op_min))
        t_em = t_shaft + (fp["fe"] + fp["mag"] + fp["mech"]) / w
    cruise = fp

    # slip at peak torque (at base speed) for the IM
    slip_peak = 0.0
    if kind == "im":
        wb = rpm_to_w(base)
        eb = envelope(kind, wb, v_max)
        slip_peak = full_point(kind, wb, eb.op_max)["slip"]

    # coast spin loss at 100 km/h
    w100 = 100 / 3.6 * VEHICLE["gear_ratio"] / VEHICLE["wheel_radius_m"]
    e100 = envelope(kind, w100, v_max)
    coast = full_point(kind, w100, solve(kind, w100, 0.0, v_max, e100.op_max, e100.op_min))
    spin = coast["fe"] + coast["mag"] + coast["mech"]

    emf_rpm = v_max / (PM.p * PM.psi_m) * RPM if kind == "pm" else None
    return dict(
        t_peak=t_peak, base_rpm=base, p_peak_kw=p_peak / 1e3, p_15k_kw=p_15k / 1e3,
        eff_peak=best[0], eff_peak_at=(best[1], best[2]), eff_cruise=cruise["eff"],
        cruise_t_em=t_em, cruise_p_dc_kw=cruise["p_dc"] / 1e3, slip_peak=slip_peak,
        slip_cruise=cruise["slip"], spin_w=spin, emf_rpm=emf_rpm,
        char_current=PM.psi_m / PM.l_d if kind == "pm" else None,
    )


TARGETS = {
    "pm": dict(t_peak=(420, 420), base_rpm=(4000, 5000), p_peak_kw=(200, 200), p_15k_kw=(140, None),
               eff_peak=(0.965, 0.975), eff_cruise=(0.93, None), spin_w=(400, 700), emf_rpm=(9000, 9000)),
    "im": dict(t_peak=(380, 380), base_rpm=(3500, 4500), p_peak_kw=(180, 180), p_15k_kw=(110, None),
               eff_peak=(0.93, 0.945), eff_cruise=(0.88, None), slip_peak=(0.015, 0.03),
               slip_cruise=(0.005, 0.015), spin_w=(60, 120)),
}


def check(val: float, lo, hi, tol: float = 0.05) -> bool:
    """Target within +-5 %; efficiency and slip ranges are checked as given (no widening)."""
    if lo is not None and val < lo * (1 - tol):
        return False
    if hi is not None and val > hi * (1 + tol):
        return False
    return True


def print_targets(kind: str, tg: dict) -> None:
    print(f"\n== {kind.upper()} targets (V_dc = {V_DC_NOM:.0f} V, V_max = {v_max_of(V_DC_NOM):.1f} V) ==")
    for k, (lo, hi) in TARGETS[kind].items():
        v = tg[k]
        ok = check(v, lo, hi, 0.0 if k.startswith(("eff", "slip")) else 0.05)
        print(f"  {'OK ' if ok else 'BAD'} {k:12s} {v:10.4g}   target [{lo}, {hi}]")
    for k in ("eff_peak_at", "cruise_t_em", "cruise_p_dc_kw", "char_current"):
        if tg.get(k) is not None:
            print(f"      {k:12s} {tg[k]}")


# ---------------------------------------------------------------------------------------------
# Reference table (§7.4) and vectors
# ---------------------------------------------------------------------------------------------

TABLE_RPM = [1000, 3000, 4500, 7000, 10000, 15000]
TABLE_T = [50, 150, 300, "max"]


def reference_table(kind: str, v_max: float) -> list[dict]:
    rows = []
    for rpm in TABLE_RPM:
        w = rpm_to_w(rpm)
        env = envelope(kind, w, v_max)
        for tq in TABLE_T:
            t = env.t_max if tq == "max" else float(tq)
            if t > env.t_max:
                continue
            op = solve(kind, w, t, v_max, env.op_max, env.op_min)
            fp = full_point(kind, w, op)
            rows.append(dict(rpm=rpm, t_req=tq, t_max=env.t_max, t_min=env.t_min, **fp))
    return rows


def print_table(kind: str, rows: list[dict]) -> None:
    print(f"\n== §7.4 frozen reference table: {kind.upper()} ==")
    print("  rpm    T      id      iq    |v|    eff%   slip%    cu     rcu     fe    mag   mech   inv")
    for r in rows:
        tq = f"{r['torque']:.0f}" if r["t_req"] == "max" else str(r["t_req"])
        print(
            f"  {r['rpm']:5d} {tq:>4s} {r['i_d']:7.1f} {r['i_q']:7.1f} {r['v_mag']:6.1f} "
            f"{100 * r['eff']:6.2f} {100 * r['slip']:6.2f} {r['cu']:6.0f} {r['rcu']:6.0f} "
            f"{r['fe']:6.0f} {r['mag']:5.0f} {r['mech']:5.0f} {r['inv']:5.0f}"
        )


def markdown_table(kind: str, rows: list[dict]) -> str:
    name = "Magnet (IPM)" if kind == "pm" else "Induction"
    out = [f"**{name}** (V_dc = {V_DC_NOM:.0f} V, winding {T_REF_C:.0f} °C; currents and voltage are dq peak)\n",
           "| rpm | T (N·m) | i_d (A) | i_q (A) | \\|v\\| (V) | eff (%) | slip (%) | Cu (W) | rotor Cu (W) | iron (W) | magnet (W) | mech (W) | inverter (W) |",
           "|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|"]
    for r in rows:
        tq = f"{r['torque']:.1f} (max)" if r["t_req"] == "max" else str(r["t_req"])
        out.append(
            f"| {r['rpm']:,} | {tq} | {r['i_d']:.1f} | {r['i_q']:.1f} | {r['v_mag']:.1f} | {100 * r['eff']:.2f} | "
            f"{100 * r['slip']:.2f} | {r['cu']:.0f} | {r['rcu']:.0f} | {r['fe']:.0f} | {r['mag']:.0f} | "
            f"{r['mech']:.0f} | {r['inv']:.0f} |"
        )
    return "\n".join(out)


def main() -> None:
    quick = "--quick" in sys.argv
    v_max = v_max_of(V_DC_NOM)
    t0 = time.time()
    tg = {k: targets(k, v_max) for k in ("pm", "im")}
    for k in ("pm", "im"):
        print_targets(k, tg[k])
    print(f"\n(targets in {time.time() - t0:.1f} s)")
    if quick:
        return

    t0 = time.time()
    raw = {k: build_map(k, v_max) for k in ("pm", "im")}
    q = {k: quantize_map(raw[k]) for k in raw}
    maps = {k: MapLookup(q[k]) for k in q}
    print(f"(maps in {time.time() - t0:.1f} s)")

    sc = {}
    for k in ("pm", "im"):
        sc[k] = dict(
            launch=scenario_launch(maps, k),
            top=scenario_top_speed(maps, k),
            cruise=scenario_cruise(maps, k),
            regen=scenario_regen(maps, k),
            coast=scenario_coast(maps, k),
            derate=scenario_derate(maps, k),
        )
    print("\n== Vehicle scenarios ==")
    for k in ("pm", "im"):
        s = sc[k]
        print(f"  {k.upper()}: 0-100 {s['launch']['t_0_100_s']:.2f} s | top {s['top']['top_kmh']:.1f} km/h "
              f"@ {s['top']['top_rpm']:.0f} rpm | cruise {s['cruise']['kwh_per_100km']:.2f} kWh/100km "
              f"(T {s['cruise']['t_em']:.1f} N·m, slip {100 * s['cruise']['slip']:.2f} %) | "
              f"regen peak {s['regen']['p_regen_max_kw']:.1f} kW, stop {s['regen']['stop_time_s']:.1f} s | "
              f"coast drag {s['coast']['drag_w']:.0f} W | derate at launch {s['derate']['first_derate_launch']} "
              f"(Tw max {s['derate']['t_winding_max_c']:.0f} °C, Tr max {s['derate']['t_rotor_max_c']:.0f} °C) | "
              f"energy err {100 * s['launch']['energy_error_rel']:.3f} %")
    dt100 = sc["im"]["launch"]["t_0_100_s"] - sc["pm"]["launch"]["t_0_100_s"]
    print(f"  IM - PM 0-100: {dt100:+.2f} s (target +0.2..+0.6)")
    print(f"  road load at 110 km/h: {road_load(110 / 3.6):.1f} N, {road_load(110 / 3.6) * 110 / 3.6 / 1e3:.2f} kW")

    tables = {k: reference_table(k, v_max) for k in ("pm", "im")}
    for k in ("pm", "im"):
        print_table(k, tables[k])

    # §6.5 map spot checks for the TS port
    rng = np.random.default_rng(7)
    spots = []
    for k in ("pm", "im"):
        for _ in range(40):
            rpm = float(rng.uniform(0, 16000))
            tq = float(rng.uniform(-420, 420))
            spots.append(dict(motor=k, rpm=rpm, t_req=tq, **maps[k].lookup(rpm, tq)))

    out = dict(
        meta=dict(v_dc_nom=V_DC_NOM, v_max=v_max, t_ref_c=T_REF_C, generated_by="reference/motor_model_reference.py"),
        params=dict(pm=asdict(PM), im=asdict(IM), vehicle=VEHICLE, battery=BATTERY, mech=MECH,
                    inverter=INVERTER, thermal=THERMAL, driver=DRIVER),
        targets=tg,
        envelopes={k: dict(rpm=MAP_RPM.tolist(), t_max=q[k]["t_max"].tolist(), t_min=q[k]["t_min"].tolist()) for k in q},
        table=tables,
        lookups=spots,
        scenarios=sc,
    )
    path = Path(__file__).with_name("vectors.json")
    path.write_text(json.dumps(out, indent=1, default=float), encoding="utf-8")
    md = "\n\n".join(markdown_table(k, tables[k]) for k in ("pm", "im"))
    Path(__file__).with_name("table_7_4.md").write_text(md + "\n", encoding="utf-8")
    print(f"\nwrote {path.name} and table_7_4.md")


if __name__ == "__main__":
    main()
