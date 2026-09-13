"""Validate the generated investor PDF against its current financial and team inputs.

Run after build-investor-deck.py; requires pypdf. Visual inspection is still needed.
"""
from pathlib import Path
import hashlib
import json
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent.parent
read_json = lambda path: json.loads((ROOT / path).read_text(encoding='utf-8'))
meta = read_json('src/smarttec-investor/data/investor-deck.json')
model = read_json('src/data/investor-model-v6-1.json')
scenarios = {row['id']: row for row in model['scenarios']}
base = scenarios['base']
assumptions = model['assumptions']
data = (ROOT / 'output/pdf' / meta['filename']).read_bytes()
assert hashlib.sha256(data).hexdigest() == meta['sha256']
assert len(data) == meta['bytes'] < 4_000_000
assert data == (ROOT / 'output/pdf/SmartTec-Investor-Presentation.pdf').read_bytes()
assert meta['modelVersion'] == model['version']
assert meta['financialSource'] == model['source']
assert meta['primaryReturnMetric'] == 'dated-funded-project-irr'
assert meta['currentReturnStatus'] == 'conditional-scenarios'
for path, key in [
    ('src/data/investor-model-v6-1.json', 'modelSourceSha256'),
    ('tools/build-investor-deck.py', 'builderSourceSha256'),
    ('tools/export-investor-deck-data.mjs', 'exporterSourceSha256'),
    ('src/data/team.json', 'teamSourceSha256'),
    ('src/data/yasir-credentials.json', 'credentialsSourceSha256'),
]:
    assert hashlib.sha256((ROOT / path).read_bytes().replace(b'\r\n', b'\n')).hexdigest() == meta[key], path
pdf = PdfReader(ROOT / 'output/pdf' / meta['filename'])
assert len(pdf.pages) == meta['pages'] == 26
texts = [' '.join(page.extract_text().split()) for page in pdf.pages]
assert all(len(text) > 150 for text in texts)
money = lambda value: '${:,.0f}'.format(value)
million = lambda value: ('-' if value < 0 else '') + '${:.2f}m'.format(abs(value) / 1e6)
pct = lambda value: '{:.2f}%'.format(value * 100)

for member in read_json('src/data/team.json'):
    assert member['name'] in texts[18], member['name']
    if member.get('email'):
        assert member['email'] in texts[18], member['email']
for key in ['serverHardwareUsd', 'storageAndSparesUsd', 'freightAndTaxUsd', 'infrastructureUsd', 'totalUsd']:
    assert money(base['capital'][key]) in texts[10], key
assert money(base['capital']['cashReserveUsd'] + base['capital']['launchTopUpUsd']) in texts[10]
assert money(base['capital']['totalUsd'] - assumptions['initialFounderCapitalUsd']) in texts[10]
assert 'Shared AI inference' in texts[2] and 'multi-tenant' in texts[2]
assert 'Dedicated GPU servers' in texts[2] and 'Single-tenant' in texts[2]
assert 'cannot earn twice' in texts[2]
assert 'Colocation / hosting' in texts[3] and 'Customer-owned hardware' in texts[3]
assert 'hosting revenue are excluded' in texts[3]
assert '50 years' in texts[5] and '1% annually' in texts[5] and 'BC LLC' in texts[5]
assert f"{assumptions['energyUsdPerKwh'] * 100:g} cents" in texts[6]
assert money(assumptions['demandUsdPerKwMonth']) + '/kW' in texts[6]
assert 'Grid first' in texts[6] and 'No behind-the-meter discount' in texts[6]
assert 'Supermicro' in texts[7] and money(base['capital']['serverHardwareUsd'] / base['capacity']['nodes']) in texts[7]
assert 'Air-cooled' in texts[7]
assert str(assumptions['includedSupportMonths']) + ' operating months included' in texts[7]
assert pct(assumptions['postWarrantySupportRate']) in texts[7]
assert pct(assumptions['annualCostInflation']) in texts[7]
assert 'One failed node leaves 56' in texts[8]
assert f"{base['technical']['itKw']:,.1f} kW" in texts[9]
assert f"{base['technical']['facilityPeakKw']:,.1f} kW" in texts[9]
assert f"{base['technical']['chillerCount']} x {base['technical']['chillerUnitTons']:g}-ton chillers" in texts[9]
assert f"{base['technical']['inRowCoolerCount']} x {base['technical']['inRowUnitKw']:g} kW in-row coolers" in texts[9]
assert '0 signed customer contracts' in texts[4] and '0 paid pilots' in texts[4]
assert pct(base['returns']['datedFundedIrr']) in texts[13]
assert pct(assumptions['hurdleRate']) in texts[13]
assert million(base['returns']['datedFundedNpvUsd']) in texts[13]
assert f"{base['returns']['fundedMoic']:.3f}x" in texts[13]
assert pct(assumptions['hardwareResaleYear5']) in texts[13]
assert pct(assumptions['infrastructureResale']) in texts[13]
assert 'does not clear the hurdle' in texts[13]
for row in base['annual']:
    for key in ['revenueUsd', 'opexUsd', 'ebitdaUsd', 'operatingCashUsd']:
        assert million(row[key]) in texts[12], (row['year'], key)
for scenario in scenarios.values():
    assert pct(scenario['returns']['datedFundedIrr']) in texts[14], scenario['id']
    assert million(scenario['capital']['totalUsd']) in texts[14], scenario['id']
assert 'none is signed' in texts[14]
assert str(scenarios['delayed']['commercial']['buildMonths']) + '-month launch delay' in texts[14]
assert 'six-year forecast' in texts[16]
assert pct(assumptions['hardwareResaleYear6']) in texts[16]
assert 'No solar/BESS capex' in texts[20]
assert money(assumptions['phase1InternetAnnualUsd'] / 12) + '/month' in texts[19]
assert 'scope are unconfirmed' in texts[19]
assert 'No investor waterfall is modeled' in texts[22]
assert 'Workbook stays private' in texts[24]
all_text = '\n'.join(texts)
for obsolete in ['$7.274', '$7.022', '$652,800', '225 kW', '28.7%', 'Updated ROI: not established', '72 GPUs', '$604,000']:
    assert obsolete not in all_text, obsolete
assert '\ufffd' not in all_text

links = [annotation.get_object().get('/A', {}).get('/URI') for page in pdf.pages for annotation in page.get('/Annots', [])]
for url in ['mailto:yasir@smarttec.dev', 'tel:+19185203823', 'https://www.smarttec.dev/investors', 'https://docs.nvidia.com/dgx/dgxb300-user-guide/introduction-to-dgxb300.html']:
    assert url in links, url

credentials = read_json('src/data/yasir-credentials.json')
assert credentials['profileUrl'] in links
for credential in credentials['certifications']:
    assert credential['shortLabel'] in texts[18]
    assert credential['verificationUrl'] in links

layout = read_json('tmp/pdfs/deck-layout.json')
for page in range(1, meta['pages'] + 1):
    boxes = [box for box in layout['boxes'] if box['page'] == page]
    for i, a in enumerate(boxes):
        x, y, w, h = a['box']
        for b in boxes[i + 1:]:
            xx, yy, ww, hh = b['box']
            overlap = min(x + w, xx + ww) - max(x, xx) > 2 and min(y + h, yy + hh) - max(y, yy) > 2
            assert not overlap, [page, a['text'], b['text']]
        for rule in layout['rules']:
            if rule['page'] == page:
                left, right = sorted(rule['x'])
                crosses = min(x + w, right) - max(x, left) > 2 and y + 2 < rule['y'] < y + h - 2
                assert not crosses, [page, 'Divider crosses text', a['text'], rule]
print(f"PASS: {meta['pages']} pages, canonical v{model['version']} scenario values, service boundaries, disclosures, team, links, source/artifact hashes and text geometry. Visual inspection remains a separate check.")
