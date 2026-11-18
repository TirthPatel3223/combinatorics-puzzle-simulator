# David's Gear Cube: research notes

These notes record what the puzzle is, how it moves, how its geometry was fitted from reference photography and spherical bevel-gear kinematics, and how the 3D simulator models it.

## Identity

| | |
|---|---|
| Puzzle | Meffert's *David's Gear Cube* (originally *Polo Gear Cube*) |
| Designers | Conceived by David Tzur (Alex Polonsky), engineered by Oskar van Deventer, 2012 (mass-produced by Meffert's from Dec 2013) |
| Museum | [pkey 3420](https://twistypuzzles.com/app/museum/museum_showitem.php?pkey=3420): "A 2x2x2 combined with a special turn including gears", 60 mm |
| Size | 60 mm face to face (1 model unit = 30 mm) |
| Pieces | 56 across 8 octants: 8 corner gears, 24 face-centre gear sectors (4 per face), 24 half-edge posts (3 per octant); 96 stickers (16 per face) |
| Colours | Standard Meffert's scheme: white top (`U`), green front (`F`), red left (`L`), orange right (`R`), blue back (`B`), yellow bottom (`D`) |

## Classification and mechanism

- **2×2×2 + 9:12 bevel-gear hybrid.** The three orthogonal midplanes ($x = 0, y = 0, z = 0$) divide the cube into 8 octants. Every octant has an internal frame (reaching the surface at its 3 half-edge posts with pairs of rectangular bar stickers `||`), 1 corner gear mounted on the octant's body-diagonal axle, and 3 face-centre gear sectors (one on each of the octant's 3 faces).
- **Gear ratio ($9 : 12 = 3 : 4$).** Each corner gear has **9 teeth** around its 3-fold body-diagonal axis (**3 teeth per face**: 2 full interior teeth + 2 half-teeth shared across the cube edges). On each face, 4 quarter-circle sectors meet around a circular black hub to form a **12-tooth face-centre gear** (**3 teeth per quadrant**, at $15^\circ, 45^\circ, 75^\circ$, so the $0^\circ$ and $90^\circ$ cut lines pass through the valleys between teeth).
- **Shape-preserving.** Rotating a corner gear by $120^\circ$ advances $9 \times \frac{120^\circ}{360^\circ} = 3$ teeth, which drives every meshing face-centre gear by $\frac{3}{12} \times 360^\circ = 90^\circ$ (one quadrant). Because corners have 3-fold symmetry ($120^\circ$) and face centres have 4-fold symmetry ($90^\circ$), all $2\times 2\times 2$ cut planes realign after every gear move and every face move.

## How it moves

The cube is $[-1, 1]^3$ ($1\text{ unit} = 30\text{ mm}$), with $x = R, y = U, z = F$.

- **Fixed reference corner (`DBR`).** Because every piece belongs strictly to one of the 8 octants (there is no independent middle slice ring), turning a face on a fixed corner is equivalent to turning the opposite face plus a whole-cube rotation. Keeping the `DBR` octant frame $(+1, -1, -1)$ fixed preserves perspective during scrambles and solves, leaving the three active face turns **`U`, `F` and `L`**.
- **Default camera view.** The `corner` view faces the **`UFL` control corner** $(-1, +1, +1)$ (azimuth $-45^\circ$, elevation $28^\circ$), placing all three active faces (`U` white on top, `L` red front-left, `F` green front-right) and the primary gear-turn control corner directly in front of the viewer, with the fixed `DBR` corner anchored at the back.
- **A clockwise quarter turn of an active face (`U`, `F` or `L`):**
  - rotates the 4 octants on that face's side of the cube (4 corner gears, 12 centre sectors, 12 half-edge posts = 28 pieces) rigidly by $-90^\circ$ right-handed about the face's outward normal;
  - leaves the opposite 4 octants (including `DBR`) stationary;
  - involves no relative gear spin.
- **The corner gear turn (`G` / `G'`), controlled by the opposite corner pair `UFL`–`DBR`:**
  - The gear contact graph is **bipartite**: the 8 corner gears mesh only with the 6 face-centre gears (never corner-to-corner or centre-to-centre).
  - For **`G`** (`+1`):
    - all **24 half-edge posts** (the 8 octant frames, including `DBR`'s) remain **stationary**;
    - all **8 corner gears** (including `DBR`'s corner gear cap) rotate **$120^\circ$ clockwise** (*as seen from outside each respective corner*, i.e. $-120^\circ$ right-handed about each corner's outward body diagonal);
    - all **6 face-centre gears** (4 sectors per face) rotate **$90^\circ$ counterclockwise** (*as seen from outside each respective face*, i.e. $+90^\circ$ right-handed about each face's outward normal), stepping each centre sector to the next quadrant on that same face.
  - Note on 3D world axes: because opposite corners (such as `UFL` and `DBR`) and opposite faces have opposite outward normals in 3D space, two opposite corners both turning clockwise *as seen from outside* rotate in opposite directions around their shared 3D diagonal line (so two hands holding opposite corners twist in opposite directions).
- **Consequences** (all tested in `tests/david/engine.test.ts`):
  - `U`, `F` and `L` each have order 4;
  - `G` has exact piece-permutation order $\operatorname{lcm}(3, 4) = 12$;
  - `G3` restores all 8 corner orientations while rotating every face centre by $270^\circ$ on its own face (leaving a solved cube visually solved);
  - `G4` restores all 24 centre sectors to their exact starting quadrants while twisting all 8 corners by $120^\circ$ relative to their octant frames;
  - Martywolfman's centre-swapping algorithms (adapted to fixed `DBR` by using `L2` in place of `R2`):
    - `(F G F' G' L2) (G F G' F' L2)` has order 2, preserves all 8 octants and all 8 corner orientations, and swaps two centre sector pairs on `L` and `R` (`L:UFL <-> L:DBL` and `R:UBR <-> R:DFR`);
    - `(G' F' G F L2) (F' G' F G L2)` has order 2, preserves all 8 octants and all 8 corner orientations, and swaps two top (`U`) centre sectors with two bottom (`D`) centre sectors (`U:UFL <-> D:DBL` and `U:UBR <-> D:DFR`).

### Exact bookkeeping in `CUBE_GROUP` (`src/david/model.ts`, `src/david/moves.ts`)

The chiral octahedral group `CUBE_GROUP` of 24 proper cube rotations (exact $3\times 3$ signed permutation matrices) acts:
- 3-to-1 on the 8 corner slots (24 corner poses = 8 vertices $\times$ 3 orientations), via prototype vector $(1, 1, 1)/\sqrt{3}$;
- simply transitively (1-to-1) on the 24 centre-sector slots, via prototype vector $(1, 1, 4)/\sqrt{18}$;
- simply transitively (1-to-1) on the 24 half-edge post slots, via prototype vector $(2, 1, 2)/3$.

Every piece's complete state (both slot and 3D orientation) is therefore a single integer index `ori[id]` in `0..23`, and every face turn or gear turn updates `ori[id]` by integer table lookup in `CUBE_GROUP.mul`.

## Geometry and sticker fitting

### Spherical bevel-gear pitch cones

On the cube, a face normal $\vec{n}_F = (0, 0, 1)$ and an adjacent corner diagonal $\vec{d}_{UFR} = (1, 1, 1)/\sqrt{3}$ meet at the cube centre at angle $\gamma = \arccos(1/\sqrt{3}) \approx 54.74^\circ$. For a $12 : 9$ ($4 : 3$) spherical bevel gear pair with $\alpha_{\text{centre}} + \alpha_{\text{corner}} = \gamma$ and $\sin\alpha_{\text{centre}} / \sin\alpha_{\text{corner}} = 4/3$:
- $\alpha_{\text{centre}} = 31.60^\circ$, $\alpha_{\text{corner}} = 23.14^\circ$;
- on the face plane $z = 30\text{ mm}$, the theoretical pitch circle along the face diagonal lies at $r_{\text{diag}} = 30\tan(31.60^\circ) = 18.45\text{ mm}$ ($(u, v) = (13.05, 13.05)\text{ mm}$).
- When a 9-tooth cone around $(1, 1, 1)/\sqrt{3}$ (teeth every $40^\circ$ in the diagonal plane, at $\psi = \pm 20^\circ, \pm 60^\circ$) is sliced by the face plane $z = 1$, the foreshortening $\cos\gamma = 1/\sqrt{3}$ places the interior teeth at angle $\phi = 45^\circ - \arctan(\tan 20^\circ / \sqrt{3}) = 33.13^\circ$ from the cube edge in face coordinates (fitted on the rectified photo: $\phi_T = 32.2^\circ$).

### Fitted sticker parameters (`src/david/stickers.ts`, `tools/david/fit_stickers.py`)

The White face of a retail Meffert's David's Gear Cube photo was rectified by optimising the perspective homography for $D_4$ symmetry and averaging all 8 symmetric views. Each sticker is built from straight segments, circular arcs and tangent fillets (`src/david/sketch.ts`):

- **Centre gear sector (`CENTRE_MM`):**
  - cut-line offset `dCut = 0.65 mm` ($0.15\text{ mm}$ half-gap $+ 0.50\text{ mm}$ plastic margin);
  - inner black hub cutout circle `rHub = 7.85 mm`;
  - tooth root radius `rRoot = 12.95 mm`, tip radius `rTip = 19.15 mm` (teeth at $15^\circ, 45^\circ, 75^\circ$, straddling the $18.45\text{ mm}$ theoretical pitch radius);
  - tooth half-widths `wBase = 1.05 mm`, `wTip = 1.00 mm`, fillets `rRf = 0.45 mm`, `rTf = 0.75 mm`, `rCf = 0.30 mm`.
- **Corner gear sticker (`CORNER_MM`):**
  - outer sticker border `ue = 28.50 mm` (plastic bevel starts at `29.00 mm`);
  - circular vertex cutout radius `rCut = 7.20 mm` centred at $(28.50, 28.50)\text{ mm}$;
  - diagonal valley distance `dRoot1 = 17.65 mm`, interior tooth angle `phiT = 32.20°`, root/tip distances `dRoot = 17.15 mm`, `dTip = 23.05 mm`, half-widths `wb = 1.38 mm`, `wt = 0.95 mm`;
  - edge half-tooth root/tip distances `dEroot = 15.65 mm`, `dEtip = 19.90 mm`, widths `weBase = 1.72 mm`, `weTip = 1.22 mm`.
- **Half-edge bar sticker (`EDGE_BAR_MM`):**
  - rounded rectangle `[23.60, 28.50] × [1.15, 3.15] mm` with corner radius `rB = 0.35 mm`.
- **Uniform plastic padding:** `PADDING_MM = 0.50 mm`, `GAP_MM = 0.15 mm`.

### Piece solids and clearances (`src/david/render/pieces.ts`, `tests/david/meshes.test.ts`)

Because every move rotates pieces about axes through $(0, 0, 0)$, all three piece prototypes are built as **cones from the cube centre** down to the $27.5\text{ mm}$ black core sphere and rounded with the rolling-ball fillet engine (`0.4 mm` outer radius):
- **Corner (`buildCorner`):** built in the $(1, 1, 1)$ diagonal frame `DIAG` as a single cone over the union of its 3 face plateaus, their bridges across the 3 bevelled edges, and the solid black vertex cap inside the circular sticker cutout; cut by the 3 face planes and 3 bevel planes.
- **Centre sector (`buildCentre`):** cone along $+z$ over the 3-tooth sector plateau with the inner black hub quadrant filled flush to the face plane.
- **Half-edge post (`buildEdge`):** built in the $(1, 0, 1)/\sqrt{2}$ edge-diagonal frame `EDGE_DIAG` as a single cone over the `F` and `R` bar plateaus and their bridge across the `FR` bevel; cut by $z = 1, x = 1$ and the `FR` bevel plane.
- **Clearances:**
  - At rest (solved and scrambled): exact 3D boolean intersections across all 56 pieces and the core sphere have $0.000\text{ mm}^3$ overlap (`< 0.01 mm³` tested in `tests/david/meshes.test.ts`).
  - Mid-turn gear sweep ($t \in [0, 1]$ during `G`): minimum distance between the rotating 9-tooth corner cone and 12-tooth centre cones stays positive ($+1.32\text{ mm}$ at $t = 0.375$, $+2.94\text{ mm}$ to the stationary edge bars at $t = 0.25$).

## Notation

| Move | Meaning |
|---|---|
| `U`, `F`, `L` | $90^\circ$ clockwise turn of that $2\times 2\times 2$ half-cube (seen from outside the face); order 4. The `DBR` corner stays fixed. |
| `U'`, `F'`, `L'` | $90^\circ$ counterclockwise; `U2`, `F2`, `L2` are $180^\circ$ half-turns. |
| `G` | Corner gear turn (click `UFL` or `DBR` corner): all 8 corners $120^\circ$ CW (seen from outside each corner), all 6 face centres $90^\circ$ CCW (seen from outside each face), edge bars stationary; order 12. |
| `G'`, `G2`, `G3`, `G4` | Inverse and multiples of `G`. `G3` restores all corners; `G4` restores all centres. |

## Sources

- TwistyPuzzles Museum:
  - Polo Gear Cube / David Gear Cube <https://twistypuzzles.com/app/museum/museum_showitem.php?pkey=3420>
  - David Gear Cube Plus (Justin Costa, notes the original $9:12$ corner-to-face gear ratio) <https://twistypuzzles.com/app/museum/museum_showitem.php?pkey=9746>
  - Gear and Slide (Oskar van Deventer, notes all 8 corners turning in the same outward direction) <https://twistypuzzles.com/app/museum/museum_showitem.php?pkey=3910>
- Oskar van Deventer's Meffert's page <https://oskarvandeventer.nl/meffert.html> and *Polo Gear Cube* video <https://www.youtube.com/watch?v=ooFiDxNucOs>
- J. A. Storer, *Geared 2x2x2 (a.k.a. David Gear Cube)* <https://www.cs.brandeis.edu/~storer/JimPuzzles/RUBIK/Geared2x2x2/Geared2x2x2.pdf>
- Martywolfman / community centre-swapping algorithms <https://www.youtube.com/watch?v=D9ZTWzkjApQ>
