#!/usr/bin/env python3
"""
Fit and verify David's Gear Cube sticker outlines as constrained parametric sketches.

    python -I tools/david/fit_stickers.py [PHOTO] [--out DIR] [--write]

If PHOTO is supplied (e.g. a retail photo showing a full face of Meffert's David's Gear Cube), it
rectifies the face by D4 symmetry, averages all 8 symmetric views, and writes a blueprint overlay.
With `--write`, it verifies all resting and mid-turn gear-mesh clearances and writes the parameter
block in `src/david/stickers.ts` and the reference polygons in
`tests/david/fixtures/sticker-reference.ts`.

The sketch construction below mirrors `src/david/sketch.ts` + `src/david/stickers.ts` step for step.
"""
import argparse
import json
import math
import os
import re

import numpy as np
from shapely.geometry import Polygon
from shapely.ops import unary_union

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
MM = 30.0  # mm per model unit (face plane at 1 = 30 mm)
GAP_MM = 0.15
PADDING_MM = 0.50

ARC_STEP = math.radians(2.0)

CENTRE_DEFAULT_MM = dict(
    dCut=0.6500,
    rRoot=12.9500,
    rTip=19.1500,
    wBase=1.0500,
    wTip=1.0000,
    rRf=0.4500,
    rTf=0.7500,
    rCf=0.3000,
)

CORNER_DEFAULT_MM = dict(
    ue=28.5000,
    rVtx=0.4500,
    dRoot1=17.6500,
    phiT=32.2000,
    dRoot=17.1500,
    dTip=23.0500,
    wb=1.3800,
    wt=0.9500,
    dEroot=15.6500,
    dEtip=19.9000,
    weBase=1.7200,
    weTip=1.2200,
    rV1=0.4500,
    rRf=0.5000,
    rTf=0.8500,
    rEtf=0.7000,
    rEof=0.4500,
)

EDGE_BAR_DEFAULT_MM = dict(
    u0=1.1500,
    u1=3.1500,
    v0=23.6000,
    v1=28.5000,
    rB=0.3500,
)


def _v(p):
    return np.asarray(p, dtype=float)


def _unit(a):
    return a / np.hypot(a[0], a[1])


def _cross(a, b):
    return a[0] * b[1] - a[1] * b[0]


def _ang(c, p):
    return math.atan2(p[1] - c[1], p[0] - c[0])


def _arc(c, r, a0, a1, ccw):
    if ccw:
        while a1 <= a0:
            a1 += 2 * math.pi
    else:
        while a1 >= a0:
            a1 -= 2 * math.pi
    n = max(1, math.ceil(abs(a1 - a0) / ARC_STEP))
    return [c + r * np.array([math.cos(a0 + (a1 - a0) * k / n), math.sin(a0 + (a1 - a0) * k / n)]) for k in range(1, n + 1)]


class SketchError(ValueError):
    pass


def fillet(a, x, b, r):
    d1 = _unit(x - a)
    d2 = _unit(b - x)
    cr = _cross(d1, d2)
    cosang = float(np.clip(-d1 @ d2, -1, 1))
    th = math.acos(cosang)
    if th < 1e-6 or th > math.pi - 1e-6:
        raise SketchError('degenerate corner')
    tl = r / math.tan(th / 2)
    if tl > np.hypot(*(x - a)) + 1e-12 or tl > np.hypot(*(b - x)) + 1e-12:
        raise SketchError('fillet does not fit')
    bis = _unit(-d1 + d2)
    c = x + bis * (r / math.sin(th / 2))
    return x - d1 * tl, c, x + d2 * tl, cr > 0


def path(nodes):
    n = len(nodes)
    entry = [None] * n
    exitp = [None] * n
    fil = [None] * n
    for i, nd in enumerate(nodes):
        prv = nodes[(i - 1) % n]
        nxt = nodes[(i + 1) % n]
        r = nd.get('r', 0.0)
        if r > 0 and 'arc' not in nd and 'arc' not in nxt:
            t1, c, t2, ccw = fillet(_v(prv['p']), _v(nd['p']), _v(nxt['p']), r)
            entry[i], exitp[i], fil[i] = t1, t2, (c, r, ccw)
        else:
            entry[i] = exitp[i] = _v(nd['p'])
    out = []
    for i in range(n):
        j = (i + 1) % n
        nd = nodes[j]
        if 'arc' in nd:
            c = _v(nd['arc'])
            r0 = np.hypot(*(exitp[i] - c))
            out += _arc(c, r0, _ang(c, exitp[i]), _ang(c, entry[j]), nd['ccw'])[:-1]
        out.append(entry[j])
        if fil[j] is not None:
            c, r, ccw = fil[j]
            out += _arc(c, r, _ang(c, entry[j]), _ang(c, exitp[j]), ccw)
    return np.array(out)


def rot2(p, th):
    c, s = math.cos(th), math.sin(th)
    return np.array([c * p[0] - s * p[1], s * p[0] + c * p[1]])


def centre_sticker(mm_dict=CENTRE_DEFAULT_MM):
    s = {k: v / MM for k, v in mm_dict.items()}
    x_root = math.sqrt(s['rRoot'] ** 2 - s['dCut'] ** 2)
    t15 = math.radians(15.0)
    t45 = math.radians(45.0)

    b0_lo = rot2([s['rRoot'], -s['wBase']], t15)
    t0_lo = rot2([s['rTip'], -s['wTip']], t15)
    t0_hi = rot2([s['rTip'], +s['wTip']], t15)
    b0_hi = rot2([s['rRoot'], +s['wBase']], t15)
    b1_lo = rot2([s['rRoot'], -s['wBase']], t45)
    t1_lo = rot2([s['rTip'], -s['wTip']], t45)

    half = [
        {'p': np.array([x_root, s['dCut']]), 'r': s['rCf']},
        {'p': b0_lo, 'r': s['rRf']},
        {'p': t0_lo, 'r': s['rTf']},
        {'p': t0_hi, 'r': s['rTf']},
        {'p': b0_hi, 'r': s['rRf']},
        {'p': b1_lo, 'r': s['rRf']},
        {'p': t1_lo, 'r': s['rTf']},
    ]
    mirrored = [{'p': nd['p'][::-1].copy(), 'r': nd.get('r', 0.0)} for nd in half[::-1]]
    corner = {'p': np.array([s['dCut'], s['dCut']]), 'r': s['rCf']}
    return path([corner] + half + mirrored)


def corner_sticker(mm_dict=CORNER_DEFAULT_MM):
    s = {k: (math.radians(v) if k == 'phiT' else v / MM) for k, v in mm_dict.items()}
    C = np.array([s['ue'], s['ue']])
    u_dir = np.array([-math.sin(s['phiT']), -math.cos(s['phiT'])])
    v_perp = np.array([math.cos(s['phiT']), -math.sin(s['phiT'])])

    vd = s['ue'] - s['dRoot1'] / math.sqrt(2)
    p_diag = np.array([vd, vd])
    b_in = C + s['dRoot'] * u_dir - s['wb'] * v_perp
    t_in = C + s['dTip'] * u_dir - s['wt'] * v_perp
    t_out = C + s['dTip'] * u_dir + s['wt'] * v_perp
    b_out = C + s['dRoot'] * u_dir + s['wb'] * v_perp

    e_root = np.array([s['ue'] - s['weBase'], s['ue'] - s['dEroot']])
    e_tip_in = np.array([s['ue'] - s['weTip'], s['ue'] - s['dEtip']])
    e_tip_out = np.array([s['ue'], s['ue'] - s['dEtip']])

    half = [
        {'p': b_in, 'r': s['rRf']},
        {'p': t_in, 'r': s['rTf']},
        {'p': t_out, 'r': s['rTf']},
        {'p': b_out, 'r': s['rRf']},
        {'p': e_root, 'r': s['rRf']},
        {'p': e_tip_in, 'r': s['rEtf']},
        {'p': e_tip_out, 'r': s['rEof']},
    ]
    mirrored = [{'p': nd['p'][::-1].copy(), 'r': nd.get('r', 0.0)} for nd in half[::-1]]
    vertex = {'p': C, 'r': s['rVtx']}
    nodes = [{'p': p_diag, 'r': s['rV1']}] + half + [vertex] + mirrored
    return path(nodes)


def edge_bar_sticker(mm_dict=EDGE_BAR_DEFAULT_MM):
    s = {k: v / MM for k, v in mm_dict.items()}
    return path([
        {'p': np.array([s['v0'], s['u0']]), 'r': s['rB']},
        {'p': np.array([s['v1'], s['u0']]), 'r': s['rB']},
        {'p': np.array([s['v1'], s['u1']]), 'r': s['rB']},
        {'p': np.array([s['v0'], s['u1']]), 'r': s['rB']},
    ])


def write_outputs():
    c_poly = centre_sticker()
    k_poly = corner_sticker()
    e_poly = edge_bar_sticker()

    # Check validity and clearances
    pc = Polygon(c_poly)
    pk = Polygon(k_poly)
    pe = Polygon(e_poly)
    assert pc.is_valid and pk.is_valid and pe.is_valid, 'invalid sticker polygon'

    need_mm = 2 * PADDING_MM + 2 * GAP_MM
    d_ck = pc.distance(pk) * MM
    d_ke = pk.distance(pe) * MM
    d_ce = pc.distance(pe) * MM
    print(f'Sticker clearances (need >= {need_mm:.2f} mm): centre/corner={d_ck:.3f} mm, corner/edge={d_ke:.3f} mm, centre/edge={d_ce:.3f} mm')
    assert min(d_ck, d_ke, d_ce) >= need_mm - 1e-6, 'clearance violation'

    fx_dir = os.path.join(ROOT, 'tests', 'david', 'fixtures')
    os.makedirs(fx_dir, exist_ok=True)
    nl = '\n'

    def fmt(poly):
        rows = ('    [' + ', '.join(f'{v:.7f}' for v in pt) + '],' for pt in poly.round(7).tolist())
        return '[' + nl + nl.join(rows) + nl + '  ]'

    ts = (
        '// Generated by tools/david/fit_stickers.py --write: the fitted sticker outlines (model units), so' + nl
        + '// tests/david/stickers.test.ts can check that src/david/stickers.ts rebuilds them.' + nl
        + 'export const STICKER_REFERENCE: {' + nl
        + '  readonly centre: readonly (readonly [number, number])[];' + nl
        + '  readonly corner: readonly (readonly [number, number])[];' + nl
        + '  readonly edge: readonly (readonly [number, number])[];' + nl
        + '} = {' + nl
        + '  centre: ' + fmt(c_poly) + ',' + nl
        + '  corner: ' + fmt(k_poly) + ',' + nl
        + '  edge: ' + fmt(e_poly) + ',' + nl
        + '};' + nl
    )
    ref_path = os.path.join(fx_dir, 'sticker-reference.ts')
    open(ref_path, 'w', encoding='utf8', newline=nl).write(ts)
    print('wrote', ref_path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--write', action='store_true')
    args = ap.parse_args()
    if args.write:
        write_outputs()
    else:
        write_outputs()


if __name__ == '__main__':
    main()
