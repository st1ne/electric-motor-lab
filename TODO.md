# Electric Motor Lab: build TODO

Companion to `TECH_SPEC.md` (§ numbers refer to it). Work top to bottom: each phase ends with a **Done when** check and a ready-to-paste **Opus prompt**. Keep `TECH_SPEC.md` and `TODO.md` in the repo root and attach them to every prompt.

**Ground rules for every phase**
- Everything in English: code, comments, UI copy, commits.
- Physics first, pixels second. No number goes on screen unless it comes from `src/physics`.
- No Tesla logos, wordmarks or product replicas (§ brand rule). The drive unit is generic.
- One phase per Opus session (best in Claude Code, so it can run tests itself). Commit after each phase: `feat(phase-N): …`.
- After each phase, run `npm run dev`, click through it yourself, and tick the boxes.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · ★ = critical for the wow moments

---

## Phase 0: Project setup  (≈ 0.5 h)

- [x] `npm create vite@latest electric-motor-lab -- --template vanilla-ts`
- [x] Install `three` (pin the exact version), `@types/three`, `vitest`, `eslint`, `prettier`, `tsx`
- [x] `tsconfig`: `strict`, `noUncheckedIndexedAccess`, alias `@/` → `src/`
- [x] Folder tree from §13.2 with typed stub modules
- [x] `src/ui/styles.css` with the §3.2 tokens, including the 3 phase colors; Google Fonts (Outfit, Inter, JetBrains Mono)
- [x] `index.html`: full-bleed `<canvas id="scene">`, `#ui-root`, `<noscript>` fallback
- [x] npm scripts: `dev`, `build`, `preview`, `test`, `lint`, `format`, `maps`
- [x] `README.md`: what it is, how to run, where the physics comes from, the brand rule

**Done when:** a dark page with the token background; `npm test` runs; lint clean.

**Opus prompt**
```
You are building "Electric Motor Lab" from TECH_SPEC.md (attached). Do Phase 0 from TODO.md only:
scaffold Vite + strict TypeScript, install three (pin exact version), vitest, eslint, prettier, tsx.
Create the full folder tree from §13.2 with typed stub modules (export the public signatures, throw "not implemented").
Add the CSS tokens from §3.2 (including the phase A/B/C colors), fonts, index.html structure, npm scripts, README.
All code and comments in English. Output every file in full. Do not start physics or 3D yet.
```

---

## Phase 1: Physics reference and tuning ★  (≈ 4–5 h)

This is the most important phase. First a Python reference (easy to iterate), then tune, then freeze.

### 1.1 Python reference (`reference/motor_model_reference.py`)
- [x] IPM dq model (§6.2): flux, voltage, torque, current and voltage limits
- [x] IM rotor-flux-oriented model (§6.3): torque, slip, voltage, rotor current
- [x] Loss model (§6.4): stator copper with temperature + AC factor, rotor copper, iron (k_h, k_e), magnet eddy, mechanical, inverter, gearbox
- [x] Minimum-loss operating-point solver for (rpm, T_cmd) for both motors, with envelopes T_max(rpm) and T_min(rpm)
- [x] Vehicle + battery + driver + thermal (§6.8–6.10); scenarios: launch, cruise 110, top speed, regen 0.25 g, coast, 10× launch derate
- [x] Print a report: envelope table, efficiency at key points, slip, spin losses at 100 km/h, 0–100 time, top speed, kWh/100 km

### 1.2 Tuning
- [x] Tune p/ψ_m/L_d/L_q/R_s/I_max (IPM) and L_m/L_ls/L_lr/R_s/R_r/I_max (IM), plus the loss coefficients, until **every §7.1 target is within ±5 %**
- [x] Check `ψ_m / L_d < I_max` (infinite-speed field weakening)
- [x] Freeze the parameters; write the §7.4 frozen reference table (both motors) into TECH_SPEC.md
- [x] Export `reference/vectors.json` (the operating points + scenario results) for the TS tests

### 1.3 TypeScript port
- [x] `config/motor.ts`, `vehicle.ts`, `battery.ts`, `thermal.ts`: frozen parameters
- [x] `physics/pmsm.ts`, `induction.ts`, `losses.ts`, `operatingPoint.ts`, `envelope.ts`: a line-by-line port
- [x] `scripts/build-maps.ts` → `src/physics/maps.generated.json` (65 speeds × 169 torques × 2 motors, float32, 4 significant digits); `physics/maps.ts` bilinear lookup + clamp
- [x] `physics/kinematics.ts`: display-time angles, phase currents, field angle, load angle, Auto slow-mo (§6.6)
- [x] `physics/pwm.ts`: SVPWM duties, carrier, switch states (§6.7)
- [x] `physics/vehicle.ts`, `driver.ts` (presets + PI cruise), `battery.ts`, `thermal.ts`, `sim.ts` (fixed 1/240 s), `regime.ts`, `format.ts`

### 1.4 Tests (Vitest)
- [x] `invariants.test.ts`: all 10 invariants from §7.2
- [x] `targets.test.ts`: all §7.1 targets from the TS maps (±5 %)
- [x] `reference.test.ts`: the TS matches `reference/vectors.json` (currents ±1 A, efficiency ±0.1 pp, envelope ±1 N·m)
- [x] `scenarios.test.ts`: §7.3 (launch, regen, derate)
- [x] `fuzz.test.ts`: 10k random inputs → finite outputs

**Done when:** `npm test` is green; the Python report and the TS maps agree; TECH_SPEC §7.4 is filled in.

**Opus prompt (Python part)**
```
Phase 1.1–1.2 of TODO.md. Write reference/motor_model_reference.py (numpy only) implementing TECH_SPEC.md §6.2–6.10
exactly: IPM dq model, induction machine with rotor-flux orientation, the full loss model, a minimum-loss operating-point
solver with current and voltage limits, torque envelopes, vehicle/battery/driver/thermal models and the scenarios.
Then TUNE the starting parameters until every target in §7.1 is within ±5 % — iterate, run it, show the report each time.
Freeze the parameters, print the §7.4 table and write reference/vectors.json. Comments in English.
```

**Opus prompt (TS part)**
```
Phase 1.3–1.4 of TODO.md. Port reference/motor_model_reference.py line by line into src/physics (pure TS, no three.js),
using the frozen parameters. Add scripts/build-maps.ts, maps lookup, kinematics (§6.6), PWM (§6.7), vehicle, driver
presets, battery, thermal, fixed-step sim and regime classification. Write the Vitest suites from Phase 1.4.
Units in every name (omegaMechRad, currentPeakA, tempC). Header comment with the equation + spec section in every file.
```

---

## Phase 2: Scene shell  (≈ 2 h)

- [x] Renderer, post chain (bloom 0.6 / 0.4 / 0.8, SMAA, OutputPass), tone mapping (decide ACES or AgX and lock)
- [x] Camera + OrbitControls with limits, idle drift, `flyTo()` (§4.5)
- [x] Lights + RoomEnvironment (§4.2)
- [x] `materials.ts` factory with the `uDim` injection (for Follow modes later)
- [x] `units.ts` (1:3 scale), `rafLoop.ts` with the fixed-step sim and separate display-time integration (§6.11)
- [x] Environment: room, workbench, ruler (real cm), brand plate, props (tool rack, coolant reservoir, jack, plant)
- [x] `dyno.ts`: rollers, flywheel with index mark, LED km/h readout (CanvasTexture)
- [x] `battery.ts` (environment): module with 96 instanced cells, fill bar, orange HV cables
- [x] `scopeScreens.ts`: 2 wall screens as CanvasTextures (placeholder content for now)
- [x] Placeholder cylinder for the motor, to check scale and composition

**Done when:** the bench scene renders at 60 fps; the rollers spin with the sim's speed when you press Launch (dev key); draw calls < 90.

**Opus prompt**
```
Phase 2 of TODO.md: scene shell per TECH_SPEC.md §4 and §13. Renderer + post chain, camera rig with limits/idle drift/flyTo,
lights, uDim material factory, raf loop with the fixed-step sim and a separate slow-mo display clock.
Build the "chassis dyno bench" environment: room, workbench with cm ruler, dyno rollers + flywheel + km/h LED,
battery module with 96 instanced cells and HV cables, two wall screens as CanvasTextures, low-poly props.
All procedural, draw calls < 90, dev stats overlay on backtick. English comments.
```

---

## Phase 3: Motor geometry ★  (≈ 4 h)

- [x] `stator.ts`: lamination stack with 54 teeth (extruded profile), lamination stripe shader
- [x] `windings.ts` ★: hairpins as `InstancedMesh`, phase assignment per slot (A, −C, B, −A, C, −B pattern), end turns, lead cables to 3 bus bars in phase colors
- [x] `rotorPM.ts`: laminations with V-slots, 12 magnets (instanced), end plate with a d-axis notch
- [x] `rotorIM.ts`: laminations, 50 skewed copper bars (instanced), 2 end rings, d-axis notch
- [x] `shaft.ts` (hollow), bearings; `housing.ts`: cast housing with fins, oil ports, split into pieces for the cutaway
- [x] `rotorSwap.ts`: axial slide-out/slide-in swap animation (0.8 s)
- [x] Rotor angle driven by `DisplayAngles.thetaMech`

**Done when:** in a debug view with the housing hidden, the stator and both rotors read clearly; phase colors match the winding pattern; the rotor swap is smooth.

**Opus prompt**
```
Phase 3 of TODO.md: procedural motor geometry per TECH_SPEC.md §5.1–5.3 (full scale, group scaled 1/3).
Priority: windings.ts. 54-slot stator, hairpins instanced per slot with the correct phase pattern (A,-C,B,-A,C,-B, 3 slots each,
6 poles), end turns, colored bus bars. Magnet rotor with V-magnets and an induction rotor with 50 skewed bars + end rings,
both with a visible d-axis notch, plus the axial swap animation. Housing split into parts ready for a quarter cutaway.
Use InstancedMesh for all repeated parts. English comments.
```

---

## Phase 4: Inverter and drivetrain  (≈ 3 h)

- [x] `inverter.ts`: housing, 6 SiC switch tiles, DC-link capacitor, gate-driver PCB with LEDs, bus bars
- [x] `switches.ts`: LEDs from `switchStates` (flicker in ×10000, averaged glow otherwise, max 3 Hz visual flicker under reduced motion)
- [x] `gears.ts` (reuse from the wind lab if available): helical reduction 19:57 and 23:69 (total 9.0)
- [x] `differential.ts`: ring, spiders, side gears
- [x] `halfShafts.ts` with CV joints; `wheels.ts`: generic 5-spoke rim, tyre with tread
- [x] Kinematics: all speeds from ω_m and the ratios; visual speed cap + blur discs only in Real slow-mo (§5.5)

**Done when:** from the motor to the rollers everything turns at consistent ratios; nothing strobes at 15,000 rpm in Real mode.

---

## Phase 5: UI shell  (≈ 3 h)

- [x] Layout regions (§3.1), title block, intro
- [x] Components: segmented, slider, hold-button (brake), icon buttons
- [x] `controlPanel.ts`: Follow, Drive presets, Throttle + Brake, Motor, Slow-mo, View, icons (§3.4)
- [x] `statCards.ts`: MOTOR / TORQUE / POWER with tweened tabular numbers and mode-dependent sub-lines (§3.3)
- [x] `explainer.ts` + `templates.ts` ★: **all** regime templates from §3.5, colored concept words, the slow-mo tail sentence
- [x] `hotkeys.ts` (§3.9), `help.ts` (hotkeys, assumptions: peak vs RMS, stylized field, generic drive unit, Nikola Tesla's 1888 induction-motor patent note), `toast.ts`, `loader.ts` (stator ring lighting up)
- [x] `store.ts` + `uiState.ts`

**Done when:** every control drives the sim; Launch records a 0–100 time and shows the toast; the texts switch correctly through Launch → Cruise → Top speed → Regen → Coast.

**Opus prompt**
```
Phase 5 of TODO.md: the HTML/CSS UI per TECH_SPEC.md §3 with vanilla TS. Glass panels, segmented controls, throttle slider,
hold-to-brake button, presets, stat cards with tweened tabular numbers, the live explanation panel with EVERY regime template
from §3.5, hotkeys, help overlay (assumptions + history note), toasts, loader, observable store.
Match the reference look (dark glass, white active pill, dim mono hotkey hints). Accessible markup. English copy exactly as in the spec.
```

---

## Phase 6: Wiring, slow motion and presets  (≈ 2 h)

- [x] `main.ts`: store → sim → kinematics → scene → UI → audio stub
- [x] Slow-mo modes Auto / ×100 / ×1000 / ×10000 / Real with the log-space auto adjustment and readable snapping (§6.6)
- [x] Freeze (Space) stops display time only
- [x] Presets with the driver model (§6.9); throttle input cancels presets
- [x] Throttles: text 10 Hz, wall screens 10 Hz (charts 30 Hz arrive with Phase 10)
- [x] Dev overlay: snapshot + display angles JSON

**Done when:** Launch at ×1000 shows the rotor and field accelerating smoothly while the car does a real-time 0–100; freeze stops the field but the km/h keeps climbing.

---

## Phase 7: Views: Whole / Cutaway / Exploded  (≈ 3 h)

- [x] Quarter cutaway with 2 clipping planes through the shaft axis (the wedge facing the camera), animated 0.9 s (§8)
- [x] Section caps: hatched fill, violet edge (back-face caps in the cut shader instead of a stencil pass)
- [x] Exploded: radial shells, rotor slides out, inverter lifts, gearbox splits; 60 ms stagger; dashed guide lines
- [~] Label visibility per view (Phase 11); hotkey V done; URL `view` (Phase 12)
- [x] Cutaway is the default view

**Done when:** no pops, no cap gaps, the rotor and field animate during transitions.

---

## Phase 8: Field visuals ★★  (≈ 4–5 h)

The heart of the page. Take your time here.

- [x] Coil glow per phase from `ia/ib/ic` (emissive in phase color ∝ |i|); end-turn particles flow direction by sign
- [x] `fieldArrow.ts`: violet arrow in the air-gap plane at `θ_field / p`, length ∝ |B̂|
- [x] `gapArrows.ts`: 54 instanced arrows scaled by `B(φ)` in the vertex shader
- [x] `fluxLines.ts`: 2p bundles × 6 ribbons from a precomputed arc template, rotated with the field (stylized, §9)
- [x] `hologram.ts`: enlarged transparent stator cross-section above the motor (field lens) with its own arrow + rotor marker
- [x] Rotor d-axis arrow (white) + load-angle arc between rotor and field, with a label
- [x] Induction: bar glow ∝ bar current; the field gains laps on the rotor; lap counter (§10.2)
- [x] "Only phase A" toggle (key O): a pulsating field instead of a rotating one (§10.1)
- [x] QA: at ×1000 the brightest coil, the field arrow and the scope cursor are aligned (proved in windings.test.ts + kinematics.test.ts; screen recording still to do in Phase 16)

**Done when:** a non-engineer watching for 10 s at ×1000 can say "the three coils take turns and the arrow goes round, and the rotor follows it". In Induction they can see the arrow pulling ahead.

**Opus prompt**
```
Phase 8 of TODO.md: the field visuals per TECH_SPEC.md §6.6, §9 (Field row) and §10.1–10.2. This is the hero effect.
Drive everything from DisplayAngles (thetaCurrent, thetaField, thetaMech, thetaSync, ia/ib/ic).
Coil emissive per phase, field arrow, 54 instanced air-gap arrows sized by B(phi) in the vertex shader, stylized flux-line
ribbons rotating with the field, a floating hologram cross-section, a load-angle arc, induction bar glow and lap counter,
and an "only phase A" toggle that shows a pulsating (not rotating) field. Everything must stay phase-locked with the scope chart.
```

---

## Phase 9: Power and heat visuals  (≈ 3 h)

- [x] `powerFlow.ts`: path battery → cable → inverter → bus bars → coils → shaft → gears → half-shafts → wheels; pulses amber (drive) / green reversed (regen), count and speed ∝ |P|
- [x] Loss "leaks": orange puffs at each component ∝ its loss (from the loss breakdown)
- [x] Battery cells glow amber/green; SoC fill bar
- [x] `heat.ts`: temperature color ramp on windings and magnets/cage (40 → 160 °C); derate warning
- [x] `oilJets.ts`: particles from the hollow shaft onto the end turns
- [x] Follow modes (`follow.ts`): `uDim` transitions, forced chart per mode (§9)

**Done when:** in Regen the pulses flip within 200 ms; 10 repeated launches visibly heat the windings and trigger DERATE.

---

## Phase 10: Charts and gauges  (≈ 3 h)

- [ ] `chartBase.ts`: DPR canvas, axes, grid, mono ticks, theme colors
- [ ] `torqueSpeedMap.ts`: drive and regen envelopes, efficiency heat map with contours (from the build-time maps), base-speed marker, live dot with 5 s trail, cross-fade on motor swap
- [ ] `scope.ts` ★: i_a/i_b/i_c over 2 periods in display time, synced cursor, voltage-limit line, real-time scale readout
- [ ] `lossesBar.ts`: stacked losses and efficiency
- [ ] `runChart.ts`: speed vs time with the 0–100 highlight
- [ ] `voltageGauge.ts`: |v| vs V_max with the ghost no-load back-EMF needle (§10.3)
- [ ] `vectorInset.ts`: dq plane with the current circle, voltage ellipse and the moving operating point (§10.3)
- [ ] Wall screens mirror the scope and the torque–speed map

**Done when:** at Top speed, the gauge and the dq inset clearly show field weakening kicking in near 9,000 rpm.

---

## Phase 11: Labels  (≈ 2 h)

- [ ] DOM label pool, projection, behind-camera cull, occlusion every 6th frame, priority collision, max 9, 200 ms fades
- [ ] All labels from the §3.7 table with live values and mode/view visibility

---

## Phase 12: Tour, chips, URL, share  (≈ 2 h)

- [ ] `tour/steps.ts` + `tour.ts`: 6 steps (§11), caption bar, Resume pill
- [ ] `chips.ts`: 4 camera chips (§3.8)
- [ ] `urlState.ts` (§16), `share.ts`
- [ ] `{BRAND}` and `{HANDLE}` in one config file

**Done when:** the tour runs end to end in ≈ 50 s; a shared URL restores motor, view, follow, slow-mo and camera.

---

## Phase 13: Audio  (≈ 1.5 h)

- [ ] WebAudio graph from §12: motor whine (6·f_e and 12·f_e harmonics), inverter hiss, gear mesh whine, roller rumble, limiter
- [ ] Audio follows real time (not slow-mo); starts after a user gesture; off by default; mute state in the URL

---

## Phase 14: Polish ★  (≈ 3 h)

- [ ] Motion pass (§4.6); no easing on physics-driven motion
- [ ] Bloom/exposure: only coils, field arrow, flux lines, LEDs and screens glow
- [ ] Typography: tabular numbers, units `rpm`, `N·m`, `kW`, `A pk`, `V`, `°C`, `km/h`
- [ ] Copy pass at edge cases: 0 km/h, top speed, regen at 5 km/h, derate, coast in both motors
- [ ] Side-by-side comparison with the reference screenshots (panel spacing, pills, label style, headline scale)

---

## Phase 15: Performance, mobile, accessibility  (≈ 3 h)

- [ ] Measure against §14; fix the top offenders; adaptive DPR; lazy maps with the analytic fallback
- [ ] Mobile bottom sheet with throttle, brake and presets in the peek (§15)
- [ ] Reduced motion; flicker ≤ 3 Hz; keyboard-only and screen-reader passes; contrast
- [ ] Test on Chrome, Safari, Firefox, iOS Safari, Android Chrome

---

## Phase 16: QA and launch  (≈ 2 h)

- [ ] Run the §18 acceptance checklist, item by item
- [ ] Traceability table in README: every on-screen number → physics function
- [ ] Brand check: no logos, wordmarks or product replicas
- [ ] Lighthouse: Perf ≥ 85, A11y ≥ 95, BP ≥ 95
- [ ] OG image (Field mode, Cutaway, ×1000), meta tags, favicon, noscript
- [ ] Deploy (Vercel / Netlify / Cloudflare Pages)
- [ ] Record a 20–30 s capture for the launch post: slow-mo field → Launch → swap to Induction (slip) → Top speed (field weakening) → Regen

---

## Stretch ideas (after launch)
- [ ] Second scene "Skateboard": EV chassis with a structural battery, 3 motors and torque vectoring in a turn
- [ ] Switched reluctance motor as a third rotor option
- [ ] Demagnetization demo: overheat the magnets and watch the torque constant drop permanently (with a reset)
- [ ] Cogging torque: turn the magnet rotor by hand (drag) and feel the notches (haptic-like snapping)
- [ ] Efficiency-map "drive cycle": replay a WLTP cycle as a dot cloud on the map

## Time estimate
≈ 45–50 hours of focused work, or about 17 Opus sessions (Phases 1 and 8 may take two sessions each).
