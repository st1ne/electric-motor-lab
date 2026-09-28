# Electric Motor Lab: Why the Rotor Chases the Field

An interactive 3D explainer built with three.js. The visitor floors the throttle of an EV drive
unit on a chassis-dyno bench, slows time down 1,000× and watches three sine waves of current
build a rotating magnetic field that drags the rotor around. Every number on screen comes from a
physics model in `src/physics`.

- Spec: [`TECH_SPEC.md`](TECH_SPEC.md) · Build plan: [`TODO.md`](TODO.md)
- Brand rule: the drive unit is a generic "200 kW class EV rear drive unit". Tesla may be
  mentioned in explanatory text, but no Tesla logos, wordmarks or product replicas. `{BRAND}` and
  `{HANDLE}` live in `src/config/brand.ts`.

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

## Status

Phases 0–4 are done (scaffold, physics reference and port, scene shell, motor geometry, inverter
and drivetrain). Modules not built yet throw `not implemented`.

Temporary dev hotkeys until the Phase 5 UI:

| Key | Action |
|---|---|
| Q W E R T | Launch / Cruise / Top speed / Regen / Coast |
| ↑ / ↓ | Pedal throttle ±5 % |
| S (hold) | Brake |
| M | Magnet ↔ Induction |
| V | Whole / Cutaway / Exploded (Exploded is Phase 7; it currently looks like Cutaway) |
| , / . | Slow-mo slower / faster |
| Space | Freeze the field visuals |
| O | Only phase A |
| 1–4 | Follow mode (sets the magnet tint only for now) |
| B | "Bare" motor: housing hidden (Phase 3 debug view) |
| C | Cycle camera presets |
| ` | Stats and snapshot overlay |

In dev builds, `window.__lab` exposes the sim, scene and camera.
