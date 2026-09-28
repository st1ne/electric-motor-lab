# Electric Motor Lab: Why the Rotor Chases the Field

An interactive 3D explainer built with three.js. The visitor floors the throttle of an EV drive
unit on a chassis-dyno bench, slows time down 1,000× and watches three sine waves of current
build a rotating magnetic field that drags the rotor around. Every number on screen comes from a
physics model in `src/physics`.

- Spec: [`TECH_SPEC.md`](TECH_SPEC.md) · Build plan: [`TODO.md`](TODO.md)
- Brand rule: the drive unit is a generic "200 kW class EV rear drive unit". Tesla may be
  mentioned in explanatory text, but no Tesla logos, wordmarks or product replicas. The wordmark
  (@SolSt1ne), the Share link (reposts the launch post on X) and the Follow link live in
  `src/config/brand.ts`.

## Run

```bash
npm install
npm run dev        # dev server
npm test           # Vitest: invariants, targets, reference match, scenarios, fuzz
npm run lint
npm run build      # type-check + production build
npm run maps       # rebuild src/physics/maps.generated.json and diff the envelopes vs Python
python reference/motor_model_reference.py          # full reference report + vectors.json
python reference/motor_model_reference.py --quick  # §7.1 target report only
```

The Python reference needs numpy only.

## Where the physics comes from

`reference/motor_model_reference.py` is the source of truth (TECH_SPEC §6):

- **Magnet motor:** an interior permanent-magnet synchronous machine. It uses the
  amplitude-invariant dq model with magnet torque plus reluctance torque, and current and voltage
  limits.
- **Induction motor:** a steady-state rotor-flux-oriented model. It covers slip, the referred
  rotor current, and magnetizing current capped at its saturation value.
- **Losses:** stator copper (temperature plus hairpin AC factor), rotor copper, Steinmetz iron
  loss, magnet eddy, bearings and windage, SiC inverter, and the gearbox.
- **Operating point:** a minimum-loss solver along the constant-torque curve with a
  golden-section refinement. It lands on MTPA below base speed and on field weakening above it.
  Torque envelopes are capped by a 150 kW battery charge limit in regen.
- **Vehicle side:** vehicle, battery (OCV plus series resistance), driver presets and a 2-node
  thermal model, stepped at a fixed 1/240 s.

Its parameters were tuned until every §7.1 target is within ±5 %, then frozen. The frozen values
and the §7.4 table are in the spec. The TypeScript port in `src/physics` is pure (no three.js),
deterministic and line-by-line. `npm test` checks it against `reference/vectors.json`: currents
±1 A, efficiency ±0.1 pp, envelope ±1 N·m, plus the scenario results.

`npm run maps` precomputes both machines on a 65 × 169 (rpm × torque) grid. That is about 250 KB
gzip. At runtime the sim only does bilinear lookups clamped to the envelope.

Conventions: currents and voltages are dq **peak** values, and the UI will label them `A pk`.
`T` in the maps is the electromagnetic torque. Iron, magnet and mechanical losses act as a drag
torque on the shaft, which is why a coasting magnet motor slows the car.

### Deliberate differences from the spec's starting values

- The machine parameters were tuned (§7.4). The induction machine's magnetizing current is
  capped at its rated value, since the iron saturates. Without that cap the §6.3 starting values
  give about 1,100 N·m.
- The winding thermal capacity is 4 kJ/K and the winding-to-oil resistance 0.025 K/W, instead of
  6 kJ/K and 0.012 K/W. With those values repeated launches reach the derate (§7.3); with the
  starting values they never would.
- The maps are built at a 380 V DC link. The battery's voltage sag changes the DC current, not
  the torque envelope.
- The Regen preset below 20 km/h jumps the dyno to 120 km/h, as §3.4 says. The Launch preset,
  started while the car is moving, first brakes at 0.4 g to a stop.

## Scene

- **Rig:** the drive unit, wheels, dyno and battery are built in full-scale metres inside one
  group scaled 1:3 (`src/scene/rig.ts`).
- **Motor:** a 54-slot stator with a 4-layer hairpin winding in the A, −C, B, −A, C, −B pattern,
  instanced as 3 draws, one per phase. Phase A's magnetic axis is at φ = 0; the angle convention
  is in `scene/motor/profile.ts`.
- **Rotors:** a V-magnet IPM rotor and a skewed 50-bar induction cage, with an 0.8 s axial swap.
- **Housing:** quarter shells with ribs.
- **Inverter:** DC-link capacitor, 6 SiC tiles and gate-driver LEDs that follow the SVPWM switch
  states, plus phase-coloured bus bars.
- **Drivetrain:** a helical 19:57 × 23:69 = 9.0 : 1 reduction whose teeth provably mesh
  (`reduction.test.ts`), an open differential, half-shafts, and generic 5-spoke wheels on
  knurled rollers with a flywheel.
- **Rotation:** every rotating part derives its angle from one visual rotor angle. In slow motion
  that is the display-time angle. In Real mode it is capped at 2.5 rev/s, with blur discs.

## Visuals and UI

- **Follow modes** (`scene/follow.ts`): each mode animates the shared `uDim` uniform of the mesh
  systems it is not about over 400 ms. Field shows the field arrow, gap arrows, flux ribbons and
  the hologram (`scene/fx/fieldFx.ts`); Power the pulses from the battery to the wheels and the
  loss puffs (`scene/fx/powerFlow.ts`); Heat the temperature ramp on the windings and
  magnets/cage (`scene/fx/heat.ts`) and the oil jets (`scene/fx/oilJets.ts`).
- **Charts** (`ui/chartCard.ts`): Torque–speed map, Scope, Losses and Run, plus the voltage gauge
  and the dq inset. The wall screens draw the same scope and map views.
- **Labels** (`scene/labels.ts`, `scene/labelDefs.ts`): the §3.7 table, projected DOM pills with
  occlusion, priority collision and 200 ms fades.
- **Tour** (`tour/`): six steps, about 51 s. **URL** (`state/urlState.ts`): motor, view, follow,
  preset, thr, slow, chart, cam, sound. **Audio** (`audio/audio.ts`): synthesized, off by default.

## Traceability: every on-screen number → physics

| On screen | Snapshot field | Computed in |
|---|---|---|
| MOTOR rpm, Rotor label | `rpm` | `sim.ts` from `vehicle.motorOmega(v)` |
| km/h, Wheel rpm | `kmh`, `wheelRpm` | `sim.ts` vehicle state, `vehicle.wheelRpm` |
| TORQUE, torque–speed dot | `tMotor`, `tShaft`, `tWheel` | `maps.ts` lookup clamped to `envelope.ts`; drag in `losses.ts` |
| POWER, efficiency | `pShaft`, `pDc`, `eff` | `sim.ts` power balance (`pDc = pEm + losses`) |
| Phase A/B/C currents, scope traces | `angles.ia/ib/ic` | `kinematics.ts` from `id`, `iq` and the display angle |
| Field frequency, slow-mo tail | `omegaE` | `sim.ts` (IM: includes slip) |
| Load angle | `loadAngle` | `sim.ts`, atan2(−v_d, v_q) |
| Slip, bar current | `slip`, `barCurrentA` | `sim.ts` (§6.3, `IM.kBar`) |
| Voltage gauge, V max line | `vMag`, `vMax` | `maps.ts` v_d, v_q; `config/motor.voltageMaxV(vDc)` |
| Ghost needle | `emfNoLoad` | `sim.ts`, p · ω_m · ψ_m (reaches V_max = 208 V at ≈ 9,000 rpm) |
| dq inset point | `id`, `iq` | `maps.ts` (build-time `operatingPoint.solve`) |
| Voltage ellipse | `vMax`, `omegaE` | `ui/vectorInset.ts` from `PM`/`IM` inductances |
| Losses bar, loss puffs | `losses.*` | `losses.ts`, `maps.ts`; gearbox in `sim.ts` |
| Efficiency map | map `eff` field | `scripts/build-maps.ts` → `maps.generated.json` |
| Winding / magnet °C, derate | `tWinding`, `tRotor`, `derate` | `thermal.ts` |
| Battery V · A, SoC | `vDc`, `iDc`, `soc` | `battery.ts` |
| Coast drag W | `dragPmW`, `dragImW` | `sim.ts` zero-current points at this speed |
| 0–100 time | `launchTime` | `driver.ts` launch preset |

## Status

Phases 0–15 are done; see [`TODO.md`](TODO.md) for the few open items (adaptive DPR, lazy maps,
browser matrix, Lighthouse, deploy, launch capture).

In dev builds, `window.__lab` exposes the sim, scene, camera, store, actions, labels, chart card,
tour and audio; `window.__lab.tick(dt, n)` steps frames by hand while the tab is hidden. The dev
key B hides the housing, and backtick toggles the stats overlay.
