# Electric Motor Lab: "Why the Rotor Chases the Field"
### Technical specification · v1.0

An interactive 3D explainer page built with three.js. The visitor floors the throttle of an EV drive unit on a lab chassis-dyno bench, slows time down 1,000×, and watches three sine waves of current build a rotating magnetic field that drags the rotor around. Then they swap the magnet rotor for an induction cage and see why that rotor can never quite catch the field. Every number on screen comes from a physics model in `src/physics`. That model is first written and validated as a reference in Phase 1 (see `TODO.md`).

> **Language rule:** all UI copy, code, identifiers, comments, commit messages and docs are in **English**.

> **Brand rule:** the page teaches how EV motors work in general. It may mention Tesla in explanatory text (for example "Tesla's first cars used induction motors"), but it must not use Tesla logos, wordmarks or a replica of any Tesla product. The drive unit is a generic "200 kW class EV rear drive unit". Placeholders `{BRAND}` and `{HANDLE}` are for the site's own brand.

---

## Contents
1. Concept and goals
2. Experience walkthrough
3. Layout and UI
4. Art direction
5. 3D model
6. Physics model
7. Targets, invariants and test vectors
8. Views: Whole / Cutaway / Exploded
9. Follow modes: All / Field / Power / Heat
10. The wow moments in detail
11. Guided tour
12. Audio
13. Architecture
14. Performance budget
15. Responsive layout and accessibility
16. URL state, sharing, SEO
17. Coding conventions
18. Acceptance criteria
19. Risks and mitigations
20. References

---

## 1. Concept and goals

### 1.1 Hook
- **Overline:** `ELECTRIC MOTOR LAB`
- **Headline (2 lines, gradient):** `WHY THE ROTOR` / `CHASES THE FIELD`
- **Intro (≤ 3 lines):** "Every EV has one. Almost nobody has seen the invisible magnet spinning inside it. Slow time down 1,000× and watch three sine waves of current drag the rotor around."

### 1.2 The three wow moments
1. **A field made of three sine waves.** In slow motion, the three phase coils glow in turn as their currents rise and fall. A glowing N–S field arrow sweeps smoothly around the air gap, even though no single coil moves. The oscilloscope cursor, coil glow and field arrow are locked together.
2. **Magnet vs Induction.** With the magnet rotor, the rotor turns exactly with the field (synchronous), a fixed angle behind it. With the induction cage, the rotor always lags (slip, 1–5 %), and copper bars glow only because of that lag. At zero slip there's no current and no torque: "if it ever caught the field, it would stop being pulled". A **Coast** preset shows the practical consequence: spinning magnets cause drag losses, while an unpowered induction motor coasts almost for free. That's why many dual-motor EVs pair one of each.
3. **Field weakening.** Above base speed the magnets' own back-EMF would exceed the battery voltage. The controller pushes current against its own magnets (negative d-axis current) so it can keep spinning faster. A voltage gauge shows the back-EMF approaching the battery limit, and the current vector visibly swings.

Secondary moment: **Regen.** Press the brake, power arrows reverse, and the battery module fills up.

### 1.3 Goals
- Physically honest: every displayed number traces to a formula in `src/physics`.
- Visual quality on par with the reference labs: diorama lab, glass UI, 3D-pinned labels, bloom, and a living explanation panel.
- Instant: first meaningful frame in < 2.5 s on a mid laptop, steady 60 fps.
- A first-time visitor reaches wow moments 1 and 2 in < 90 s without reading help.

### 1.4 Non-goals
- No finite-element magnetics. The field picture is an analytic air-gap field (6.6), not an FEM solution.
- No imported CAD/GLTF. All geometry is procedural.
- No backend. Static site.

---

## 2. Experience walkthrough

| t | What the visitor sees | What they learn |
|---|---|---|
| 0–2 s | Loader: a stator ring whose three coils light up in sequence, then fades into the scene. | — |
| 2–10 s | Default: **Cruise 60 km/h**, motor = Magnet, View = Cutaway, slow motion Auto. The field arrow sweeps and the rotor follows it. Coils A/B/C pulse coral/yellow/cyan. | The field rotates. |
| 10–30 s | Visitor presses **Launch**. The wheels on the rollers spin up, torque jumps to 400 N·m, the coils brighten, the field arrow leads the rotor by a bigger angle, and the speed-vs-time chart draws a 0–100 km/h run. | More current, more torque, bigger angle. |
| 30–50 s | Visitor clicks **Induction**. The rotor morphs from magnets to a copper cage. Now the rotor visibly lags the field; a "slip 2.1 %" label appears; the bars glow. | Slip. |
| 50–70 s | **Top speed** preset: rpm climbs past base speed, the voltage gauge hits the battery limit, the current vector swings negative on d. The text explains field weakening. | Field weakening. |
| 70–90 s | **Regen**: power pulses flip direction, the battery fills, and "+130 kW back into the battery" appears (0.25 g from 120 km/h). | Regen braking. |

---

## 3. Layout and UI

### 3.1 Screen regions (desktop ≥ 1280 px)

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ [BRAND]                                               ┌─ CONTROL PANEL ─────┐ │
│ ELECTRIC MOTOR LAB                                    │ Follow  1 2 3 4     │ │
│ WHY THE ROTOR                                         │ Drive presets       │ │
│ CHASES THE FIELD                                      │ Throttle ───●── Brk │ │
│ intro text (3 lines)                                  │ Motor  Slow-mo View │ │
│ [MOTOR] [TORQUE] [POWER]   ← stat cards               │ ▶ ⏸ 🔊 ?            │ │
│ ┌ explanation panel (live) ┐                          └─────────────────────┘ │
│ └──────────────────────────┘          3D SCENE (full-bleed canvas)            │
│ ┌ chart (tabs) ────────────┐                                                  │
│ └──────────────────────────┘                                                  │
│               [Stator] [Rotor] [Inverter] [Wheels]   ← camera chips   [↗][X]  │
└───────────────────────────────────────────────────────────────────────────────┘
```
- Canvas full-bleed; UI absolutely positioned with 24 px gutter. Left column 360 px; control panel 540–560 px, top-right.
- `{BRAND}` wordmark top-left, `{HANDLE}` "Follow on X" bottom-right next to the share button.

### 3.2 Design tokens

```css
:root {
  --bg: #0a0d18;
  --panel: rgba(13, 17, 30, 0.72);
  --panel-border: rgba(255, 255, 255, 0.08);
  --panel-blur: 18px;
  --text: #e8ecf5;
  --text-muted: #8b93a7;
  --text-dim: #5d6479;
  --phase-a: #ff6b6b;   /* phase A coil, trace, label */
  --phase-b: #ffd166;   /* phase B */
  --phase-c: #4cc9ff;   /* phase C */
  --field: #b794ff;     /* rotating field arrow, flux lines (violet) */
  --power: #ffb547;     /* drive power flow (amber) */
  --regen: #5be49b;     /* regen power flow, battery charging (green) */
  --heat: #ff7a3d;      /* losses, temperature */
  --alarm: #ff4d5e;     /* derate, limits */
  --radius-panel: 14px;
  --radius-btn: 9px;
  --font-display: "Outfit", system-ui, sans-serif;
  --font-ui: "Inter", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
}
```
- Headline: Outfit 800, 60/54 px, gradient `#c4b5fd → #7dd3fc` (violet to cyan: field meets current).
- Numbers: mono, `tabular-nums`. Glass panels as in the wind lab (blur 18 px, 1 px border, soft shadow).
- The phase colors are used **everywhere consistently**: coils in 3D, scope traces, inverter legs, labels.

### 3.3 Stat cards

| Card | Label | Value | Sub-line |
|---|---|---|---|
| 1 | `MOTOR` | `9,420 rpm` | `138 km/h · gear 9.0 : 1` |
| 2 | `TORQUE` | `190 N·m` | `1.67 kN·m at the wheels` |
| 3 | `POWER` | `187 kW` | `efficiency 95.8 %` |

- In regen, card 3 value is green with a leading `−` and the sub-line `into the battery`.
- In Induction mode card 1's sub-line becomes `slip 2.1 % · 138 km/h`.
- Values tween over 250 ms. Digits never re-layout.

### 3.4 Control panel

Row 1: **Follow** `All · Field · Power · Heat` (hotkeys `1 2 3 4`).

Row 2: **Drive** presets (segmented): `Launch` (Q) · `Cruise` (W) · `Top speed` (E) · `Regen` (R) · `Coast` (T)
- Launch: throttle 100 % from standstill, auto-release at 100 km/h (a 0–100 run).
- Cruise: speed-hold at 110 km/h (driver PI).
- Top speed: throttle 100 % from the current speed until the speed limit.
- Regen: brake at 0.25 g from the current speed (or from 120 km/h if below 20 km/h).
- Coast: throttle 0, no braking. Shows spin losses.

Row 3: **Throttle** slider 0–100 % (↑/↓, step 5) and a **Brake** hold-button (hold S or press the button; 0–0.4 g ramp). Moving the throttle cancels any preset.

Row 4: **Motor** `Magnet · Induction` (M) · **Slow-mo** `Auto · ×100 · ×1000 · ×10000 · Real` (`,` / `.`) · **View** `Whole · Cutaway · Exploded` (V).

Row 5: icon buttons: `▶` guided tour (Enter), `⏸` freeze field (Space: freezes the electromagnetic visuals only, the car keeps going), `🔊` sound (N), `?` help (H).

Behavior:
- Segmented active state is a white pill with dark text. Hotkey hints are in dim mono in row headers.
- Switching Magnet ↔ Induction animates the rotor swap (0.8 s: magnets slide out axially, the cage slides in) and re-solves the operating point without changing the car's speed.

### 3.5 Explanation panel (live text by regime)

Re-renders at most every 150 ms, only when rounded values change. Colored words: `field` violet, `phase A/B/C` in phase colors, `power` amber, `regen` green, `heat` orange.

| Regime | Template |
|---|---|
| STANDSTILL | "Motor stopped. No current, no **field**. Press **Launch** or push the throttle." |
| CONSTANT_TORQUE (below base speed, high torque) | "Three currents of **{I} A** peak, each shifted by 120°, add up to one **field** that turns at {fe} Hz. The rotor's magnets are pulled along **{delta}°** behind it: **{T} N·m**, all the way up to base speed." |
| CRUISE (light load) | "Cruising at **{kmh} km/h** takes only **{Pshaft} kW**. The currents are small ({I} A), so almost nothing is lost: **{eff} %** of the battery's power turns the wheels." |
| FIELD_WEAKENING | "At **{rpm} rpm** the spinning magnets would generate **{emf} V**, more than the battery's **{vmax} V**. The controller pushes **{idneg} A** against its own magnets to weaken the **field** and keep accelerating. Power stays near **{P} kW** while torque falls." |
| INDUCTION_SLIP (motor = Induction, drive) | "No magnets here. The **field** turns at **{fsync} rpm**, the cage at **{rpm} rpm**: **{slip} %** slower. That lag makes the bars cut through the field, which induces **{Ibar} A** in them. The induced current is what gets pulled. No lag, no current, no torque." |
| REGEN | "Braking with the motor. The rotor now runs **ahead** of the **field**, so the motor works as a generator: **{Pregen} kW** flows back into the battery. The friction brakes handle only **{Pfric} kW**." |
| COAST_PM | "Coasting at **{kmh} km/h** with no current. The magnets still sweep past the steel stator and waste **{Pdrag} W** as heat. An induction motor with no current would waste only **{Pdrag_im} W**." |
| COAST_IM | "Coasting with no current means no **field** at all. The cage spins freely and only the bearings and air cost **{Pdrag} W**. That's why many dual-motor EVs put an induction motor on the axle that often idles." |
| DERATE | "Winding at **{Tw} °C**, magnets at **{Tm} °C**. The controller trims torque to **{Tlim} N·m** to protect them." |
| TOP_SPEED | "Top speed **{kmh} km/h** (**{rpm} rpm**). The motor could spin a bit faster; the software limit is here." |

Tail sentence when slow-mo is on: "Field slowed **×{S}**; in real time it turns **{fe} times a second**."

### 3.6 Chart card (tabs, key C cycles)

360 × 160 px canvas, DPR-aware.
1. **Torque–speed map**: x 0–16,000 rpm, y −400…+420 N·m.
   - The drive envelope (upper) and regen envelope (lower) as white lines.
   - An efficiency heat-map fill (precomputed, contour lines at 85/90/94/96/97 %).
   - A base-speed marker and the live dot with a 5 s trail.
   - Magnet/Induction swaps the map with a 400 ms cross-fade.
2. **Scope** (oscilloscope):
   - Phase currents i_a/i_b/i_c over 2 electrical periods of **slow-mo time**, in phase colors.
   - A dashed line for the voltage limit envelope, and a moving cursor synced to the field arrow in 3D.
   - Axis readout `1 div = {x} ms real`.
3. **Losses**: horizontal stacked bar (copper stator, iron, rotor copper (IM only), magnets/eddy, inverter, bearings+windage, gearbox) in W, total and efficiency.
4. **Run**: speed vs time with the last 0–100 km/h run highlighted and its time shown `0–100 in 6.1 s`.

### 3.7 3D-pinned labels

| Anchor | Name | Value example | Visible in |
|---|---|---|---|
| Phase A coil group | Phase A | `+412 A` | All, Field |
| Phase B coil group | Phase B | `−198 A` | All, Field |
| Phase C coil group | Phase C | `−214 A` | All, Field |
| Field arrow tip | Field | `turning 471 Hz` | All, Field |
| Rotor d-axis marker | Rotor | `9,420 rpm` | All, Field |
| Between field and rotor | Load angle | `118°` | Field |
| Induction cage bars | Bar current | `2,300 A` | Field (Induction) |
| Air gap | Air gap | `0.7 mm` | Cutaway/Exploded |
| Inverter | Inverter | `SiC · 10 kHz` | All, Power |
| DC link | Battery | `368 V · 520 A` | Power |
| Gear set | Reduction | `9.0 : 1` | Cutaway/Exploded, Power |
| Differential | Differential | `open` | Exploded |
| Wheel | Wheel | `1,047 rpm` | All |
| Oil jet | Cooling | `oil 70 °C` | Heat |
| Stator winding | Winding | `118 °C` | Heat |
| Magnets | Magnets | `92 °C` | Heat (Magnet) |

Label rules as in the wind lab: projected DOM pool, occlusion every 6th frame, priority collision, max 9 visible, 200 ms fades.

### 3.8 Camera chips
`Stator · three phases` · `Rotor · magnets or cage` · `Inverter · DC to AC` · `Wheels · on the rollers`. Each flies the camera (1.2 s easeInOutCubic) and may set Follow/View: Stator → Field + Cutaway, Rotor → Field + Exploded, Inverter → Power, Wheels → All + Whole.

### 3.9 Hotkeys

| Key | Action |
|---|---|
| 1 2 3 4 | Follow: All / Field / Power / Heat |
| Q W E R T | Launch / Cruise / Top speed / Regen / Coast |
| ↑ ↓ | Throttle ±5 % |
| S (hold) | Brake |
| M | Magnet ↔ Induction |
| O | Only phase A on/off (pulsating vs rotating field) |
| , . | Slow-mo slower / faster |
| Space | Freeze field visuals |
| V | Cycle view |
| C | Cycle chart |
| Enter | Guided tour |
| N | Sound |
| H or ? | Help |

---

## 4. Art direction

### 4.1 Scene concept: "chassis dyno bench"
A dark lab. On a steel workbench sits an EV **drive unit** (motor + inverter + reduction gearbox + open differential) at about **1:3 scale**, bolted to a fixture. Two half-shafts run to two wheels with tyres that rest on a pair of knurled **rollers** (a chassis dynamometer). The rollers drive a heavy flywheel that stands in for the car's inertia; a small LED readout on the dyno frame shows `km/h`.

Around it:
- A **battery module** on a side stand. Its cells are an instanced cylinder grid whose tops glow amber when discharging and green when charging; a fill bar on the module shows the SoC.
- A thick orange HV cable pair from the battery to the inverter.
- A wall-mounted **oscilloscope** screen showing the scope chart live (CanvasTexture, 10 Hz) and a second screen with the torque–speed map.
- An engraved scale ruler on the bench front edge in real cm, plus a plate `{BRAND domain} / electric-motor · 200 kW class · 1:3`.
- Low-poly props: a tool rack, a coolant reservoir, a trolley jack, a small potted plant (warmth, as in the references).
- A big **floating hologram ring** above the motor in Field mode: an enlarged, transparent copy of the stator cross-section (the "field lens") so the rotating field reads from any angle.

### 4.2 Lighting
- Warm key directional from front-left (#ffd9a8, 2.0), PCFSoft shadows 2048².
- Cool hemisphere fill (#6f8cff / #15110d, 0.35).
- Violet rim spot behind the motor (#b794ff, 1.2).
- Practicals: coil glow, inverter LEDs, battery cell glow, oscilloscope screen.
- `RoomEnvironment` PMREM for metal reflections, intensity 0.3.

### 4.3 Materials
- Housing: cast aluminium (#b8bec7, metalness 0.85, roughness 0.45, subtle noise normal).
- Stator lamination stack: dark steel (#4a515c) with thin lighter lines every 2 mm (a procedural stripe in the shader) so the laminations read.
- Copper windings: #d9824b, metalness 1, roughness 0.3. Emissive in phase color ∝ |i_phase| (6.6).
- Magnets: nickel-plated (#cfd6de) with a violet emissive N/S tint in Field mode.
- Induction cage: copper bars + end rings; emissive orange ∝ bar current.
- Gears: brushed steel; oil film: transparent amber `MeshPhysicalMaterial` (transmission 0.6) in Heat mode.
- Cut caps: dark hatched fill with a **violet edge line** (the field color).

### 4.4 Post-processing
`RenderPass → UnrealBloomPass(0.6, 0.4, 0.8) → SMAA → OutputPass`, ACESFilmic (or AgX; decide once), exposure 1.0. Only coils, field arrow, flux lines, LEDs and screens exceed intensity 1.

### 4.5 Camera
fov 35, OrbitControls with damping 0.08, polar 15°–85°, distance limits fitted to the bench, idle drift after 8 s (±4° azimuth, 40 s period). Default shot: 3/4 view of the motor from the output side with the wheels visible behind.

### 4.6 Motion rules
- Every discrete change animates: UI 200–300 ms, 3D 0.8–1.2 s easeInOutCubic.
- Physics-driven motion (rotor, field, wheels, rollers) follows the sim exactly, never eased.
- `prefers-reduced-motion`: no idle drift, no camera flights (cut), slow-mo defaults to ×10000, half particles.

---

## 5. 3D model (procedural)

Build the drive unit in **full-scale millimetres/metres** and scale the group by 1/3. Keep the conversion in `scene/units.ts`.

### 5.1 Motor dimensions (generic 200 kW class IPM, full scale)

| Item | Value |
|---|---|
| Stator outer Ø / inner (bore) Ø | 225 mm / 150 mm |
| Stack length | 135 mm |
| Slots | 54 (3 phases × 6 poles × 3 slots per pole) |
| Winding | hairpin, 4 layers; end turns visible in Cutaway |
| Rotor outer Ø | 148.6 mm (air gap 0.7 mm) |
| Poles (Magnet) | 6 (pole pairs p = 3), V-shaped buried magnets, 2 per pole |
| Rotor (Induction) | 4 poles (p = 2), 50 copper bars, 2 end rings |
| Shaft | Ø 40 mm, hollow for oil |
| Housing | cast aluminium, cooling fins, oil inlet/outlet |
| Max speed | 16,000 rpm (software limit 15,300 rpm = 225 km/h) |

### 5.2 Stator
- The lamination stack is an extruded 2D profile with 54 teeth (`ExtrudeGeometry` of the full cross-section). Add a shader stripe for laminations.
- Hairpin coils are `InstancedMesh` of a U-shaped tube per slot pair, colored by phase according to the winding layout (sequence per pole pair A, −C, B, −A, C, −B, 3 slots each).
- End turns are torus-segment instances at both ends.
- Phase lead cables exit at the top to the inverter bus bars (3 bars in phase colors).

### 5.3 Rotors (swappable)
- **Magnet rotor:** lamination stack with V-slots; magnets as instanced boxes (12). Add a d-axis marker: a small bright notch on the end plate so the rotor angle is readable.
- **Induction rotor:** lamination stack, 50 skewed copper bars (instanced, skew 1 slot pitch), 2 end rings (torus), a d-axis marker notch.
- Swap animation: the current rotor slides out axially (+stack length × 1.5) and fades; the other slides in.

### 5.4 Inverter
- Housing box on top of the motor, lid removed in Cutaway.
- 3 half-bridge legs (6 SiC switch modules as small dark tiles with gold terminals), DC-link capacitor (a big film-cap block), gate-driver board (green PCB with emissive LEDs), 3 AC bus bars in phase colors, and the DC input from the orange HV cables.
- Each switch LED lights when that switch conducts (from the PWM state, 6.7). This is readable only in slow motion ×10000; otherwise it's shown as an averaged glow.

### 5.5 Reduction gearbox and differential
- Two-stage helical reduction with total **9.0 : 1**, e.g. 3.0 × 3.0 (tooth counts 19:57 and 23:69).
- Open differential: ring gear, 2 spider gears, 2 side gears. It spins with the wheel speed; spiders spin only if the wheels differ (they don't here, but it's wired in).
- Gear generator: shared with the wind lab (`gears.ts`: trapezoid teeth, `ExtrudeGeometry`, helix via twist).
- **Visual speed cap:** motor-side parts turn at up to 267 rev/s in reality. Visually cap at 2.5 rev/s **in Real slow-mo**, with motion-blur discs. In slow-mo modes the true (slowed) speed is shown and no cap is needed.

### 5.6 Dyno, wheels and battery
- Wheels: tyre (torus with tread via normal map or instanced blocks), 5-spoke rim (generic, not any brand's design), Ø 0.70 m full scale.
- Rollers: 2 knurled cylinders per wheel; flywheel with a red index mark; LED km/h readout.
- Battery module: 96 cells visible (instanced cylinders 46 mm × 80 mm), busbars, a module case with a transparent lid.

---

## 6. Physics model

Pure TypeScript in `src/physics`: no three.js imports, deterministic, unit-tested. **Phase 1 writes a Python reference (`reference/motor_model_reference.py`) first**, tunes the parameters to the targets in §7, and generates the test vectors. The TS port must then reproduce the reference.

### 6.1 Vehicle, battery and drivetrain constants (starting values)

| Symbol | Value | Meaning |
|---|---|---|
| m | 1,850 kg | vehicle mass (incl. driver) |
| m_rot | +4 % of m | rotating inertia equivalent |
| C_d·A | 0.23 × 2.22 = 0.51 m² | drag area |
| ρ_air | 1.2 kg/m³ | air density |
| C_rr | 0.009 | rolling resistance |
| r_w | 0.350 m | wheel dynamic radius |
| G | 9.0 | total gear ratio |
| η_gear | 0.975 | gearbox + differential |
| μ | 1.0 | tyre–road friction (dyno rollers emulate the road) |
| rear axle load share | 0.55 static + weight transfer `a·h/L`, h = 0.50 m, L = 2.88 m | traction limit on the driven (rear) axle |
| Battery | 96s, OCV 3.6–4.15 V/cell (linear in SoC), R_pack = 0.080 Ω | V_dc = OCV_pack − R_pack·I_dc |
| Pack energy | 60 kWh | SoC integration |
| v_max | 225 km/h (software) | top-speed limiter |

### 6.2 Motor A: interior permanent magnet synchronous machine (IPM)

**dq model, amplitude-invariant, electrical speed ω_e = p·ω_m.**
- Flux: `ψ_d = L_d i_d + ψ_m`, `ψ_q = L_q i_q`
- Voltage (steady state): `v_d = R_s i_d − ω_e ψ_q`, `v_q = R_s i_q + ω_e ψ_d`
- Torque: `T = 1.5 p [ψ_m i_q + (L_d − L_q) i_d i_q]` (magnet torque + reluctance torque)
- Limits: `√(i_d² + i_q²) ≤ I_max`, `√(v_d² + v_q²) ≤ V_max = m_max · V_dc / √3`, m_max = 0.95 (SVPWM linear range with margin)

**Starting parameters (tune in Phase 1 to the §7 targets):**

| p | ψ_m | L_d | L_q | R_s (at 20 °C) | I_max (peak) |
|---|---|---|---|---|---|
| 3 | 0.075 Wb | 0.12 mH | 0.34 mH | 7 mΩ | 700 A |

Characteristic current `ψ_m / L_d` should be < I_max, which gives infinite-speed field-weakening capability. Check it in tests.

**Operating-point selection** for a given (ω_m, T_cmd):
- Choose (i_d, i_q) that achieves T_cmd with **minimum total loss** (6.4) subject to both limits.
- Below base speed this lands on (or very near) **MTPA**, maximum torque per amp.
- Above it the voltage limit binds (**field weakening**, negative i_d).
- At very high speed with high torque it may reach **MTPV**, maximum torque per volt.
- If T_cmd is infeasible, return the envelope torque T_max(ω) (or T_min(ω) in regen) with the flag `limited: true`.
- Numerical method: 1D search along the constant-torque curve, parametrized by i_d ∈ [−I_max, 0] with `i_q = T/(1.5p(ψ_m + (L_d − L_q) i_d))`, 200 samples + golden-section refinement. Reject points violating limits.

### 6.3 Motor B: induction machine (IM) with rotor-flux-oriented control

**Steady-state dq model in the synchronous frame aligned with the rotor flux.**
- `L_s = L_m + L_ls`, `L_r = L_m + L_lr`, `σ = 1 − L_m²/(L_s L_r)`
- Rotor flux (steady): `ψ_r = L_m i_d`
- Torque: `T = 1.5 p (L_m² / L_r) i_d i_q`
- Slip frequency: `ω_sl = R_r i_q / (L_r i_d)` (electrical rad/s); `ω_e = p ω_m + ω_sl`; slip `s = ω_sl / ω_e`
- Stator voltage: `v_d = R_s i_d − ω_e σ L_s i_q`, `v_q = R_s i_q + ω_e L_s i_d`
- Rotor current (referred): `i_rq = −(L_m/L_r) i_q`, `i_rd = 0` in steady state
- Physical bar current for display: `I_bar ≈ k_bar · |i_rq|` with `k_bar` from turns ratio. Tune so the peak is about 2–3 kA per bar; it's a display-only scale, and help states it's approximate.

**Starting parameters (tune to §7 targets):**

| p | L_m | L_ls = L_lr | R_s | R_r | I_max (peak) |
|---|---|---|---|---|---|
| 2 | 1.2 mH | 0.06 mH | 8 mΩ | 6 mΩ | 800 A |

**Operating-point selection:** for (ω_m, T_cmd), search i_d ∈ [i_d,min, I_max] (i_d,min = 5 % of rated magnetizing current), solve i_q from torque, compute the voltage and losses, and pick minimum loss within limits. This naturally reduces flux at light load (efficiency optimization) and at high speed (flux weakening). With T_cmd = 0 and coasting: i_d = i_q = 0 (flux off, zero electrical loss).

### 6.4 Loss model (both machines)

| Loss | Formula | Notes |
|---|---|---|
| Stator copper | `P_cu = 1.5 R_s(T_w) (i_d² + i_q²)` | `R_s(T) = R_s20 [1 + 0.00393 (T − 20)]`, plus an AC factor `k_ac(f_e) = 1 + (f_e/f_ac)²` with f_ac ≈ 1,200 Hz for hairpins |
| Rotor copper (IM) | `P_rcu = 1.5 R_r i_rq²` | this is the "slip loss", equal to `s · P_airgap` |
| Iron (hysteresis + eddy) | `P_fe = k_h f_e ψ_s² + k_e f_e² ψ_s²`, `ψ_s = √(ψ_d² + ψ_q²)` (IM: `√((L_s i_d)² + (σL_s i_q)²)`) | tune k_h, k_e to the spin-loss targets |
| Magnet eddy (IPM) | `P_mag = k_mag f_e² (i_d² + i_q²)` | small; heats the magnets |
| Mechanical | `P_mech = c_b ω_m + c_w ω_m³` | bearings + windage |
| Inverter | `P_inv = 1.5 R_on,eff (i_d² + i_q²) + k_sw · f_sw · V_dc · I_pk` with f_sw = 10 kHz | SiC MOSFETs; target peak inverter efficiency ≈ 99 % |
| Gearbox | `P_g = (1 − η_gear)·|P_shaft|` | |

- Efficiency, drive: `η = P_shaft / P_dc`, where `P_dc = P_shaft + ΣP_loss` (motoring).
- Efficiency, regen: `η = P_dc / |P_shaft|`, where `P_dc = |P_shaft| − ΣP_loss`.
- If regen at very low speed can't cover the losses, P_dc goes positive: show "regen fades below ~5 km/h" and blend in the friction brakes.

### 6.5 Build-time maps
`npm run maps` → `src/physics/maps.generated.json` for **each motor**:
- Grid: speed 0…16,000 rpm step 250 (65 pts) × torque −420…+420 N·m step 5 (169 pts).
- Per cell: `id, iq, vd, vq, lossBreakdown{cu, rcu, fe, mag, mech, inv}, eff, slip, feasible`.
- Envelopes: `tMax(rpm)`, `tMin(rpm)` (regen, limited additionally by the battery charge-power limit 150 kW).
- Runtime: bilinear lookup; infeasible cells clamp to the envelope. Size target ≤ 400 KB gzip for both maps (quantize to float32 with 4 significant digits).
- The efficiency heat-map texture for the chart is generated from the same maps at build time (PNG data URL or JSON bytes).

### 6.6 Field and phase kinematics (what the visuals show)

Integrate in **display time** `t_d` (slowed): `dt_d = dt_real / S`, where S is the slow-mo factor.
- Rotor mechanical angle: `θ_m += ω_m · dt_d`
- Rotor electrical angle: `θ_re = p θ_m`
- **Magnet:** the field (stator current vector) angle is `θ_i = θ_re + γ`, with `γ = atan2(i_q, i_d)` (90° at pure q current, up to ~130° with MTPA / field weakening).
- **Induction:** the synchronous frame angle is integrated separately, `θ_e += ω_e dt_d` (so it runs ahead of `p θ_m` by the slip), and `θ_i = θ_e + atan2(i_q, i_d)`.
- Phase currents (instantaneous): `i_a = |I| cos(θ_i)`, `i_b = |I| cos(θ_i − 2π/3)`, `i_c = |I| cos(θ_i + 2π/3)`.
- Coil glow per phase: emissive intensity `k · |i_x| / I_max`, hue = the phase color. Negative current is shown with the same hue but inverted pulse direction (particles on the end turns flow the other way).
- Air-gap flux density picture (for flux lines, ring arrows and the hologram): `B(φ) = B̂ cos(p φ − θ_field)` with `θ_field = θ_i` (stator MMF) blended with the magnet field for Magnet mode (`θ_re`) by the ratio of their magnitudes. Visually the total field sits between the rotor d-axis and the current vector. Label the angle between rotor d-axis and field as **load angle** (derived from the dq voltages: `δ = atan2(−v_d, v_q)`).
- "Auto" slow-mo picks S so the **field** turns at ~0.4 rev/s: `S = max(1, f_field_mech / 0.4)`, smoothly adjusted (log-space lerp, 1 s) and snapped to the nearest ×1/2/5 step for a readable label.

### 6.7 PWM (visual layer, slow-mo only)
- Duty cycles from SVPWM of `v_abc` (min-max injection): `d_x = 0.5 + (v_x − (v_max + v_min)/2) / V_dc`, with v_abc from inverse Park of (v_d, v_q) at angle θ_re (Magnet) or θ_e (Induction).
- Carrier: a triangle at f_sw = 10 kHz, **in display time**. Upper switch of leg x is on when `d_x > carrier`. At S = ×10000 each carrier period lasts 1 s, so the switch LEDs are visibly flickering with the right duty.
- For S < ×1000, show averaged glow = duty cycle instead of flicker (avoid strobing).

### 6.8 Vehicle dynamics
- Motor torque command `T_cmd` from the driver (6.9), limited by the envelope, the thermal derate and the traction limit (`T_trac = μ·F_z,rear·r_w / (G η_gear)`).
- Road load: `F_road = C_rr m g + ½ ρ C_d A v²`.
- Drive force: `F = T_motor G η_gear / r_w` when motoring, `T_motor G / (r_w η_gear)` when regenerating (the gear losses reverse direction).
- `(m + m_rot) dv/dt = F − F_road − F_friction_brake`; `ω_m = v G / r_w`; wheel rpm = `v / r_w · 30/π`.
- Speed limiter: above 225 km/h, taper T_cmd to 0 over 2 km/h.
- Battery: `I_dc = P_dc / V_dc`, `V_dc = OCV(SoC) − R_pack I_dc` (solve the quadratic), `SoC −= P_dc dt / E_pack`.
- The dyno emulates the road: the rollers and flywheel just visualize v (roller rpm = v / r_roller).

### 6.9 Driver model and presets
- Throttle `u ∈ [0, 1]` → `T_cmd = u · T_max(ω)` (a torque-request pedal map, simple and honest).
- Brake `b ∈ [0, 1]` → requested deceleration `0.4 g · b`. Regen covers `min(requested, |T_min(ω)|)` and the friction brakes cover the rest. Regen fades linearly below 8 km/h.
- **Launch:** u = 1 from v = 0; on reaching 100 km/h, record the time → the chart and a toast `0–100 km/h in {t} s`.
- **Cruise:** PI speed hold at 110 km/h (Kp = 0.15 per km/h, Ki = 0.02).
- **Top speed:** u = 1 until the limiter.
- **Regen:** b such that the deceleration is 0.25 g, until 0 km/h.
- **Coast:** u = 0, b = 0, T_cmd = 0.
  - Magnet: the drag torque from P_fe + P_mag + P_mech slows the car.
  - Induction: flux is off and only P_mech.
  - Show both drag powers side by side in the text (the other motor's value comes from the maps at the same speed).

### 6.10 Thermal model (2 nodes + coolant)
- Nodes: stator winding T_w (C_w = 6 kJ/K), rotor/magnets T_r (C_r = 4 kJ/K); oil at a fixed 70 °C (radiator not modeled).
- `C_w dT_w/dt = P_cu + 0.7 P_fe − (T_w − T_oil)/R_w,oil`, R_w,oil = 0.012 K/W.
- `C_r dT_r/dt = P_rcu + P_mag + 0.3 P_fe − (T_r − T_oil)/R_r,oil`, R_r,oil = 0.035 K/W.
- Derate: winding above 150 °C, or magnets above 140 °C (Magnet only; demagnetization risk). Torque limit falls linearly to 50 % over the next 20 K.
- Start temperatures 40 °C. Typical launches won't derate; repeated launches will, which is the Heat-mode story.

### 6.11 Simulation loop
- Fixed step dt = 1/240 s real time (vehicle + thermal + battery). Max 40 sub-steps per frame.
- Display-time angles (6.6) are integrated per **frame** with `frameDt / S`, so slow-mo never affects the vehicle.
- Freeze (Space) stops display time only.
- Regime classification (for texts): STANDSTILL, CONSTANT_TORQUE, CRUISE (|T| < 25 % T_max), FIELD_WEAKENING (voltage limit active), INDUCTION_SLIP (Induction and |T| > 0), REGEN, COAST_PM, COAST_IM, DERATE (overrides), TOP_SPEED.

---

## 7. Targets, invariants and test vectors

Phase 1 tunes the §6 starting parameters until **all targets are within ±5 %**, then freezes them in `config/motor.ts`. It regenerates the test vectors below from the reference and pastes the frozen table into this section (7.4).

### 7.1 Targets

| Quantity | Magnet (IPM) | Induction |
|---|---|---|
| Peak torque (0–base speed) | 420 N·m | 380 N·m |
| Base speed (end of constant torque) | 4,500 ± 500 rpm | 4,000 ± 500 rpm |
| Peak power (battery at 380 V) | 200 kW | 180 kW |
| Power at 15,000 rpm | ≥ 140 kW | ≥ 110 kW |
| Peak drive efficiency (motor + inverter) | 96.5–97.5 % | 93–94.5 % |
| Efficiency at 110 km/h cruise | ≥ 93 % | ≥ 88 % |
| Slip at peak torque / at cruise | — | 1.5–3 % / 0.5–1.5 % |
| Spin (drag) loss coasting at 100 km/h (≈ 6,800 rpm) | 400–700 W | 60–120 W (mechanical only) |
| No-load back-EMF reaches V_max at | ≈ 9,000 rpm | n/a |

| Vehicle quantity | Target |
|---|---|
| 0–100 km/h, Magnet, full SoC, 40 °C | 5.8–6.4 s (traction-limited for the first ~1.5 s) |
| 0–100 km/h, Induction | 0.2–0.6 s slower than Magnet |
| Top speed | 225 km/h (limiter), motor ≈ 15,300 rpm |
| Battery consumption at steady 110 km/h | 13–15 kWh/100 km |
| Road load power at 110 km/h | ≈ 13.7 kW at the wheels (≈ 449 N) |

### 7.2 Analytic invariants (tests must check these exactly, independent of tuning)
1. **Balanced phases:** `i_a + i_b + i_c = 0` for any θ_i (|error| < 1e-9 · I).
2. **Power balance:** `1.5 (v_d i_d + v_q i_q) = T ω_m + P_cu` (steady state, PM) to 1e-6 relative.
3. **Torque formula consistency:** the map's torque at (id, iq) recomputed from 6.2/6.3 equals the requested T.
4. **Limits:** every feasible map cell satisfies |i| ≤ I_max + 1e-6 and |v| ≤ V_max + 1e-6.
5. **MTPA angle:** for the IPM at low speed and any T > 20 N·m, the current angle γ is in (90°, 135°) (reluctance torque uses negative i_d).
6. **Field weakening:** above base speed at T_max, i_d is more negative than at base speed.
7. **Slip sign:** Induction slip > 0 when motoring, < 0 when regenerating, 0 at T = 0.
8. **Rotor loss identity (IM):** `P_rcu = s · P_airgap` within 1e-6 relative, where `P_airgap = T · ω_e / p`.
9. **Energy conservation over a launch:** ∫P_dc dt = kinetic energy + ∫road-load work + ∫losses, within 0.5 %.
10. **Coast:** Induction electrical loss is exactly 0 at T_cmd = 0.

### 7.3 Scenario tests
- Launch 0–100 in the target window for both motors; no NaN; SoC decreases monotonically.
- Regen from 120 km/h at 0.25 g: SoC increases; the friction brakes take over below 8 km/h; v reaches 0 without overshoot.
- 10 back-to-back launches+brakes: derate triggers for the Magnet motor (magnets > 140 °C) or winding > 150 °C; torque falls, the text switches to DERATE.
- Fuzz: 10,000 random (rpm, T_cmd, SoC, temperatures) → finite outputs.

### 7.4 Frozen reference table
Generated by `reference/motor_model_reference.py` (frozen in Phase 1; the full set with envelopes, map spot checks and scenario results is `reference/vectors.json`). Tolerances for the TS port: currents ±1 A, efficiency ±0.1 pp, torque envelope ±1 N·m. Rows with T > T_max(rpm) are omitted.

**Frozen parameters** (changed from the §6 starting values to meet §7.1):

| | Magnet (IPM) | Induction |
|---|---|---|
| Pole pairs | 3 | 2 |
| Flux / inductances | ψ_m 0.0736 Wb (back-EMF = V_max at 9,014 rpm), L_d 0.125 mH, L_q 0.245 mH | L_m 1.2 mH, L_ls = L_lr 0.035 mH |
| Resistances (20 °C) | R_s 7 mΩ | R_s 12 mΩ, R_r 8.5 mΩ |
| Current limit (peak) | 860 A (ψ_m / L_d = 589 A < I_max) | 690 A; magnetizing current ≤ 166 A (saturation) |
| Iron loss k_h / k_e | 190 / 0.36 | 250 / 0.65 |
| Magnet eddy k_mag | 2.0e-9 | — |

Shared: the maps use V_dc = 380 V (V_max = 208.4 V peak) and a 70 °C winding; SiC inverter R_on,eff 1.5 mΩ, k_sw 3.0e-10; mechanical c_b 0.07, c_w 1.1e-7. Thermal (§6.10): C_w 4 kJ/K and R_w,oil 0.025 K/W, so about 7 back-to-back launch + regen cycles derate (§7.3).

**Resulting targets** (TS model and maps, checked by `npm test`):
- Magnet: 421 N·m, base 4,000 rpm, 199 kW peak, 185 kW at 15,000 rpm, peak efficiency 97.4 %, cruise 94.9 %, coast drag 565 W at 100 km/h, 0–100 in 5.75 s, top speed 226 km/h at 15,418 rpm.
- Induction: 389 N·m, base 4,400 rpm, 177 kW peak, 122 kW at 15,000 rpm, peak efficiency 94.4 %, cruise 93.5 %, slip 2.9 % at peak torque and 0.96 % at cruise, coast drag 90 W, 0–100 in 6.31 s (+0.56 s).
- 110 km/h uses 13.5 kWh/100 km (Magnet) and 13.7 (Induction). Regen from 120 km/h at 0.25 g peaks at 133 kW into the battery.

Known deviations:
- With μ = 1.0 and a 55 % static rear load, the launch is not traction-limited (peak wheel force 10.5 kN against 11.7 kN available). The 0–100 time still lands in the §7.1 window.
- The Induction top-speed run derates on winding temperature after about a minute at full power and settles at 219 km/h. The Magnet motor reaches the limiter.

**Magnet (IPM)** (V_dc = 380 V, winding 70 °C; currents and voltage are dq peak)

| rpm | T (N·m) | i_d (A) | i_q (A) | \|v\| (V) | eff (%) | slip (%) | Cu (W) | rotor Cu (W) | iron (W) | magnet (W) | mech (W) | inverter (W) |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1,000 | 50 | -38.3 | 142.1 | 25.4 | 92.97 | 0.00 | 273 | 0 | 62 | 0 | 7 | 49 |
| 1,000 | 150 | -171.1 | 354.1 | 34.6 | 86.61 | 0.00 | 1947 | 0 | 107 | 1 | 7 | 348 |
| 1,000 | 300 | -355.8 | 573.2 | 49.1 | 81.72 | 0.00 | 5729 | 0 | 214 | 2 | 7 | 1025 |
| 1,000 | 421.3 (max) | -473.8 | 717.7 | 60.1 | 79.48 | 0.00 | 9308 | 0 | 324 | 4 | 7 | 1665 |
| 3,000 | 50 | -53.5 | 138.9 | 72.0 | 96.48 | 0.00 | 283 | 0 | 206 | 1 | 25 | 50 |
| 3,000 | 150 | -187.4 | 346.9 | 95.9 | 94.49 | 0.00 | 1984 | 0 | 356 | 7 | 25 | 350 |
| 3,000 | 300 | -374.8 | 562.3 | 136.3 | 92.46 | 0.00 | 5826 | 0 | 721 | 21 | 25 | 1028 |
| 3,000 | 421.3 (max) | -473.8 | 717.7 | 170.8 | 91.43 | 0.00 | 9437 | 0 | 1139 | 33 | 25 | 1665 |
| 4,500 | 50 | -66.2 | 136.3 | 105.0 | 96.97 | 0.00 | 298 | 0 | 328 | 2 | 44 | 52 |
| 4,500 | 150 | -201.0 | 341.1 | 139.5 | 95.87 | 0.00 | 2039 | 0 | 569 | 16 | 44 | 353 |
| 4,500 | 300 | -390.3 | 553.5 | 199.0 | 94.44 | 0.00 | 5966 | 0 | 1159 | 46 | 44 | 1033 |
| 4,500 | 393.5 (max) | -629.0 | 586.5 | 208.4 | 93.56 | 0.00 | 9618 | 0 | 1261 | 75 | 44 | 1665 |
| 7,000 | 50 | -88.6 | 131.9 | 156.1 | 97.17 | 0.00 | 344 | 0 | 548 | 6 | 95 | 57 |
| 7,000 | 150 | -224.3 | 331.6 | 207.8 | 96.76 | 0.00 | 2185 | 0 | 960 | 39 | 95 | 361 |
| 7,000 | 273.5 (max) | -779.3 | 363.7 | 208.4 | 93.89 | 0.00 | 10082 | 0 | 941 | 181 | 95 | 1665 |
| 10,000 | 50 | -122.8 | 125.8 | 208.4 | 97.08 | 0.00 | 456 | 0 | 803 | 15 | 200 | 70 |
| 10,000 | 150 | -465.1 | 257.6 | 208.4 | 96.34 | 0.00 | 4167 | 0 | 781 | 141 | 200 | 637 |
| 10,000 | 184.6 (max) | -761.3 | 248.7 | 208.4 | 94.03 | 0.00 | 9458 | 0 | 773 | 321 | 200 | 1444 |
| 15,000 | 50 | -300.4 | 101.3 | 208.4 | 95.91 | 0.00 | 1756 | 0 | 661 | 113 | 536 | 226 |
| 15,000 | 118.6 (max) | -675.3 | 170.5 | 208.4 | 94.24 | 0.00 | 8475 | 0 | 642 | 546 | 536 | 1092 |

**Induction** (V_dc = 380 V, winding 70 °C; currents and voltage are dq peak)

| rpm | T (N·m) | i_d (A) | i_q (A) | \|v\| (V) | eff (%) | slip (%) | Cu (W) | rotor Cu (W) | iron (W) | magnet (W) | mech (W) | inverter (W) |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1,000 | 50 | 118.2 | 121.0 | 33.3 | 82.52 | 3.25 | 616 | 176 | 201 | 0 | 7 | 65 |
| 1,000 | 150 | 166.0 | 258.3 | 48.9 | 81.55 | 4.87 | 2032 | 803 | 405 | 0 | 7 | 212 |
| 1,000 | 300 | 166.0 | 516.6 | 55.1 | 74.38 | 9.28 | 6348 | 3213 | 436 | 0 | 7 | 663 |
| 1,000 | 388.9 (max) | 166.0 | 669.7 | 58.9 | 70.07 | 11.71 | 10264 | 5399 | 458 | 0 | 7 | 1072 |
| 3,000 | 50 | 100.6 | 142.0 | 81.5 | 91.05 | 1.52 | 657 | 243 | 499 | 0 | 25 | 68 |
| 3,000 | 150 | 166.0 | 258.3 | 135.0 | 91.14 | 1.68 | 2045 | 803 | 1361 | 0 | 25 | 212 |
| 3,000 | 300 | 166.0 | 516.6 | 142.1 | 88.79 | 3.30 | 6389 | 3213 | 1420 | 0 | 25 | 663 |
| 3,000 | 388.9 (max) | 166.0 | 669.7 | 146.8 | 86.84 | 4.23 | 10331 | 5399 | 1466 | 0 | 25 | 1072 |
| 4,500 | 50 | 92.1 | 155.3 | 111.1 | 92.65 | 1.22 | 713 | 290 | 691 | 0 | 44 | 74 |
| 4,500 | 150 | 159.5 | 268.9 | 192.4 | 92.77 | 1.22 | 2139 | 871 | 2072 | 0 | 44 | 220 |
| 4,500 | 300 | 166.0 | 516.6 | 207.5 | 91.63 | 2.22 | 6446 | 3213 | 2323 | 0 | 44 | 663 |
| 4,500 | 380.3 (max) | 162.1 | 670.7 | 208.4 | 90.19 | 2.93 | 10424 | 5415 | 2287 | 0 | 44 | 1072 |
| 7,000 | 50 | 82.0 | 174.2 | 153.4 | 93.77 | 0.99 | 830 | 365 | 989 | 0 | 95 | 84 |
| 7,000 | 150 | 108.0 | 396.9 | 208.4 | 93.16 | 1.70 | 3787 | 1896 | 1780 | 0 | 95 | 381 |
| 7,000 | 238.4 (max) | 99.8 | 682.7 | 208.4 | 90.03 | 3.11 | 10667 | 5611 | 1706 | 0 | 95 | 1072 |
| 10,000 | 50 | 73.9 | 193.5 | 197.4 | 94.28 | 0.85 | 996 | 451 | 1339 | 0 | 200 | 97 |
| 10,000 | 150 | 65.6 | 653.4 | 208.4 | 89.75 | 3.17 | 10051 | 5139 | 1403 | 0 | 200 | 971 |
| 10,000 | 154.4 (max) | 64.2 | 687.0 | 208.4 | 89.16 | 3.40 | 11102 | 5681 | 1398 | 0 | 200 | 1072 |
| 15,000 | 50 | 49.5 | 288.6 | 208.4 | 93.75 | 1.26 | 2175 | 1002 | 1214 | 0 | 536 | 193 |
| 15,000 | 79.0 (max) | 36.9 | 612.4 | 208.4 | 87.99 | 3.51 | 9618 | 4514 | 1173 | 0 | 536 | 848 |

---

## 8. Views: Whole / Cutaway / Exploded

| View | Housing | Stator | Rotor | Inverter | Gearbox | Transition |
|---|---|---|---|---|---|---|
| Whole | opaque | hidden | hidden | lid on | closed | — |
| Cutaway (default) | quarter cut (two perpendicular planes through the shaft axis, 90° wedge toward the camera removed) | quarter cut, end turns visible | quarter cut | lid off | half cut | planes animate 0.9 s |
| Exploded | shells separate radially +40 % | stays | slides out axially toward the output side | lifts up | casing splits, gears spread axially | 1.1 s easeInOutCubic, 60 ms stagger |

- Caps: stencil capping with a hatched fill and a violet edge (fallback: BackSide flat cap).
- The rotor and field keep animating in all views; dashed guide lines in Exploded.

## 9. Follow modes: All / Field / Power / Heat

Mesh `system` tags: `field | power | heat | structure | environment`. Shared `uDim` uniform via `onBeforeCompile`, 400 ms transitions.

| Mode | Emphasized | Extras |
|---|---|---|
| All | everything | field arrow at 60 %, key labels |
| Field | stator coils, rotor, hologram ring | big field arrow (N violet / S dim), rotor d-axis arrow (white), load-angle arc, ring of 54 small air-gap arrows sized by B(φ), flux-line ribbons crossing the gap, scope chart forced |
| Power | battery → HV cable → inverter → bus bars → coils → shaft → gears → half-shafts → wheels | pulses along the path: amber when driving, green reversed in regen, count/speed ∝ |P|; battery cells glow amber/green; loss "leaks" as small orange puffs at each component ∝ its loss |
| Heat | windings, magnets/cage, oil | temperature color ramp (40 → 160 °C, blue → orange → white), oil jets as particle streams from the hollow shaft spraying the end turns, derate warning, losses chart forced |

**Field arrow and flux lines implementation:**
- The field arrow is a flat violet arrow mesh in the air-gap plane at the stack mid-section, rotated to `θ_field / p` mechanical. Its length is ∝ |B̂|.
- Air-gap arrows are one `InstancedMesh` of 54 small arrows at slot pitch, each scaled by `B(φ_k)` in the vertex shader (uniforms `uThetaField`, `uP`, `uB`).
- Flux lines: 2p bundles of 6 ribbons that loop from a north pole region through the rotor and stator yoke to the adjacent south pole. They're a precomputed 2D path template (a quarter-ellipse arc family) instanced and rotated by the field angle. This is stylized, not FEM, and help says so.

## 10. The wow moments in detail

### 10.1 Three sines → one rotating field
- Entering Field mode (or the tour step) sets slow-mo ×1000 (Auto), View Cutaway, the Stator camera chip, and the Scope chart.
- The scope cursor's position = θ_i modulo 2 periods. When phase A peaks, the A coils are brightest and the field arrow points at the A-coil axis. **This alignment is the lesson; verify it visually in QA.**
- An optional "one coil at a time" toggle (key O) shows only phase A: the arrow then just pulses back and forth (a pulsating field, not rotating). Toggle back: all three add up to rotation.

### 10.2 Magnet vs Induction
- Swap animation (5.3), then:
  - Magnet: field and rotor marker locked at a steady load angle.
  - Induction: the field marker slowly **gains laps** on the rotor marker. A lap counter shows `field gained 1 lap every {1/(s·f_sync)} s (slowed)`.
- Induction cage bars glow ∝ bar current. When T = 0 (Coast), the bars go dark and the gain stops.
- Coast comparison text and a small side-by-side bar `Magnet drag 540 W · Induction 90 W` (values from the maps at the current speed).

### 10.3 Field weakening
- A **voltage gauge** (semicircle meter under the chart, or on the inverter in 3D) shows `|v|` vs `V_max`. A ghost needle shows the back-EMF with no d-current (`ω_e ψ_m`).
- When the ghost exceeds V_max, the gauge flashes violet and the dq current vector (a small 2D vector diagram inset: i_d horizontal, i_q vertical, current-limit circle, voltage-limit ellipse) shows the operating point sliding left along the ellipse.

## 11. Guided tour (▶ / Enter)
6 steps, 7–10 s each; caption bar with dots; pauses on input with a Resume pill.

| # | Camera | State | Caption |
|---|---|---|---|
| 1 | Stator | Cruise 60, Magnet, ×1000, only phase A | "One coil alone just pulses back and forth." |
| 2 | Stator | all three phases | "Three coils, 120° apart, make a field that turns." |
| 3 | Rotor | Launch | "More current, stronger pull: 420 N·m from standstill." |
| 4 | Rotor | Induction, Cruise | "No magnets? The rotor must lag, or nothing pulls." |
| 5 | Inverter | Top speed, Magnet | "Too fast for the battery's voltage: weaken the field." |
| 6 | Wheels | Regen | "Brake, and the motor becomes a generator." |

## 12. Audio (off by default, WebAudio, no files)
- **Motor whine:** the sum of sines at the electrical frequency harmonics `6·f_e` and `12·f_e` (the slot-ripple order for 54 slots / 6 poles, stylized), gain ∝ |T|. This gives the characteristic rising EV whine.
- **Inverter tone:** a faint tone at f_sw = 10 kHz, band-limited, only when |T| > 0 (a slight hiss).
- **Gear whine:** a sine at `z₁ · f_m` (tooth-mesh frequency of stage 1), gain ∝ |T|.
- **Tyre/roller rumble:** filtered noise ∝ v.
- **Slow-mo:** audio follows real time, not display time (clearly state that in help).
- Master limiter; mute state in URL.

## 13. Architecture

### 13.1 Stack
Vite + strict TypeScript, vanilla DOM, `three` (pinned, `three/addons/*`), Vitest, ESLint + Prettier, `tsx` for build scripts. Google Fonts: Outfit, Inter, JetBrains Mono.

### 13.2 File tree
```
electric-motor-lab/
  index.html · package.json · tsconfig.json · vite.config.ts
  reference/motor_model_reference.py        # Phase 1: source of truth + tuning
  scripts/build-maps.ts                     # writes src/physics/maps.generated.json
  src/
    main.ts
    config/  motor.ts · vehicle.ts · battery.ts · thermal.ts · theme.ts
    physics/ pmsm.ts · induction.ts · losses.ts · operatingPoint.ts · maps.ts · envelope.ts
             kinematics.ts · pwm.ts · vehicle.ts · driver.ts · battery.ts · thermal.ts
             sim.ts · regime.ts · format.ts
             __tests__/ invariants.test.ts · targets.test.ts · scenarios.test.ts · fuzz.test.ts
    state/   store.ts · uiState.ts · urlState.ts
    scene/   units.ts · renderer.ts · post.ts · camera.ts · cameraRig.ts · lights.ts · materials.ts
             environment/ room.ts · bench.ts · ruler.ts · dyno.ts · battery.ts · scopeScreens.ts · props.ts
             motor/ housing.ts · stator.ts · windings.ts · rotorPM.ts · rotorIM.ts · shaft.ts
             drivetrain/ gears.ts · reduction.ts · differential.ts · halfShafts.ts · wheels.ts
             inverter/ inverter.ts · switches.ts · busbars.ts
             fx/ fieldArrow.ts · gapArrows.ts · fluxLines.ts · hologram.ts · powerFlow.ts · heat.ts · oilJets.ts
             views.ts · follow.ts · labels.ts · rotorSwap.ts
    ui/      styles.css · layout.ts · controlPanel.ts · segmented.ts · slider.ts · holdButton.ts
             statCards.ts · explainer.ts · templates.ts · vectorInset.ts · voltageGauge.ts
             charts/ chartBase.ts · torqueSpeedMap.ts · scope.ts · lossesBar.ts · runChart.ts
             chips.ts · help.ts · toast.ts · loader.ts · hotkeys.ts · share.ts
    tour/    tour.ts · steps.ts
    audio/   audio.ts
    util/    math.ts · easing.ts · tween.ts · rafLoop.ts
```

### 13.3 Data flow
```
input (UI / hotkeys / tour / URL) → uiState ─┐
                                             ├→ sim.step(dtReal) → SimSnapshot
driver.ts (presets, pedal) ──────────────────┘          │
                                                        ├→ kinematics.advance(frameDt / S) → DisplayAngles
                                                        ├→ scene.update(snapshot, angles, uiState, frameDt)
                                                        ├→ ui.update(snapshot)  (text 10 Hz, charts 30 Hz)
                                                        └→ audio.update(snapshot)
```
- `SimSnapshot`: `{ t, v, kmh, omegaM, rpm, tCmd, tMotor, limited, id, iq, vd, vq, vMag, vMax, emfNoLoad, slip, omegaE, losses{…}, pShaft, pDc, eff, vDc, iDc, soc, tWinding, tRotor, derate, regime, motor, launchTime }`
- `DisplayAngles`: `{ thetaMech, thetaElecRotor, thetaSync, thetaCurrent, thetaField, ia, ib, ic, duty[3], carrier, switchStates[6] }`
- `uiState`: `{ follow, view, motor, preset, throttle, brake, slowMo, frozen, chart, onlyPhaseA, sound, tourStep }`

### 13.4 Frame loop
`rafLoop`: frameDt (clamped 0.1 s) → sim fixed steps → kinematics with the slow-mo factor → tweens → scene update → labels → composer → throttled UI. Pause when `document.hidden`.

## 14. Performance budget
| Metric | Target |
|---|---|
| JS (gzip) incl. three + maps | ≤ 550 KB |
| Draw calls | ≤ 200 (Cutaway), ≤ 280 (Exploded) |
| Triangles | ≤ 700 k |
| Frame time | ≤ 12 ms on M1 Air / RTX 2060 laptop at 1440p; ≥ 45 fps on iPhone 13 |
| First frame | ≤ 2.5 s |

Techniques:
- `InstancedMesh` for hairpins, magnets, cage bars, cells, gap arrows, bolts, teeth.
- Merge static props.
- Adaptive DPR (2 → 1.5 → 1.25 → 1) at > 18 ms average.
- Maps loaded lazily after the first frame; until then, the sim uses an analytic fallback (MTPA only).

## 15. Responsive layout and accessibility
- 900–1279 px: narrower left column, chart collapses to a button.
- < 900 px: bottom sheet (peek shows throttle, brake and presets), compact stat tiles, max 5 labels, hold-to-brake as a big button.
- A11y: real buttons and range inputs with `aria-valuetext` ("throttle 60 percent", "9,420 rpm"). `aria-live="polite"` explanation (throttled 1 per 2 s). Visible focus, contrast ≥ 4.5 : 1.
- `prefers-reduced-motion` per 4.6. Also never flash more than 3 times per second: PWM flicker is capped at 3 Hz visually in reduced-motion mode.

## 16. URL state, sharing, SEO
- Params: `motor`, `view`, `follow`, `preset`, `thr`, `slow`, `chart`, `cam`. `replaceState` debounced 500 ms.
- Share via the Web Share API or clipboard + toast.
- `<title>`: "Electric Motor Lab: Why the Rotor Chases the Field". Meta description, OG/Twitter image 1200×630 (Field mode, Cutaway, ×1000), `noscript` summary.

## 17. Coding conventions
- **English only** everywhere.
- Physics files start with a header comment: equation, spec section, source.
- Units in names: `omegaMechRad`, `omegaElecRad`, `rpm`, `torqueNm`, `powerW`, `currentPeakA`, `voltagePeakV`, `tempC`. Peak (amplitude-invariant dq) vs RMS must be explicit; UI shows **peak** phase current and labels it `A pk` in help.
- No magic numbers in scene code: dimensions in `config/motor.ts`, colors in `config/theme.ts`.
- Modules export `create…()` returning `{ object3d, update(snapshot, angles, ui, dt), dispose() }`.
- No `any`, strict null checks, Prettier 100 columns.

## 18. Acceptance criteria
1. `npm test` green: all invariants (7.2), targets (7.1, ±5 %), scenarios (7.3), and the TS port matching the frozen reference (7.4).
2. At ×1000 the field arrow, the brightest coil and the scope cursor are visibly aligned at every moment (QA with screen recording, frame-by-frame spot checks).
3. Induction mode: the field visibly gains on the rotor; in Coast the bars go dark and the gain stops.
4. Top speed: the voltage gauge reaches the limit near 9,000 rpm; the d-current goes negative in the inset; power stays within 10 % of peak up to ~12,000 rpm.
5. Regen: the flow direction and battery glow flip within 200 ms of pressing the brake.
6. Views switch without pops; the caps have no gaps.
7. 60 fps on the reference laptop in Cutaway + Field mode.
8. Lighthouse desktop: Perf ≥ 85, A11y ≥ 95, BP ≥ 95.
9. No Tesla logos, wordmarks or product replicas; all copy and comments are in English.

## 19. Risks and mitigations
| Risk | Mitigation |
|---|---|
| Operating-point solver fails at corners (MTPV, very low speed) | Precompute maps at build time with robust search; runtime only interpolates and clamps; fuzz tests. |
| Visual strobing of rotor/gears | Slow-mo is the default for the motor; visual speed cap + blur discs in Real mode. |
| "Field" picture judged inaccurate by experts | Label it "stylized air-gap field (analytic, not FEM)" in help; keep dq numbers exact. |
| Peak vs RMS confusion | One convention (peak) in code and UI, stated in help; tests on power balance. |
| Too many concepts for newcomers | The tour, plus default Cutaway + Field + Auto slow-mo, so wow moment 1 happens without any clicks. |
| Parameter tuning takes long | Phase 1 is time-boxed: accept ±5 % targets; freeze and move on. |
| Brand/IP issues | Generic drive unit, generic wheel design, no logos; Tesla only mentioned in text. |

## 20. References
- D. W. Novotny, T. A. Lipo, *Vector Control and Dynamics of AC Drives*, Oxford University Press (dq models, field orientation).
- S.-K. Sul, *Control of Electric Machine Drive Systems*, Wiley-IEEE Press (MTPA, field weakening, MTPV).
- J. R. Hendershot, T. J. E. Miller, *Design of Brushless Permanent-Magnet Machines*, Motor Design Books (IPM design, losses).
- A. Boglietti et al., "Predicting iron losses in soft magnetic materials with arbitrary voltage supply", *IEEE Trans. Magnetics*, 2003 (hysteresis + eddy loss separation).
- N. Tesla, US Patent 381,968, "Electro-Magnetic Motor", 1888 (the rotating-field induction motor; historical note in help).
- Public teardown reports of mass-market EV drive units (for plausibility of the targets only, not for geometry).
