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
readiness = read_json('tmp/pdfs/deck-financials.json')['readiness']
data = (ROOT / 'output/pdf' / meta['filename']).read_bytes()
assert hashlib.sha256(data).hexdigest() == meta['sha256']
assert len(data) == meta['bytes'] < 4_000_000
pdf = PdfReader(ROOT / 'output/pdf' / meta['filename'])
assert len(pdf.pages) == meta['pages'] == 26
texts = [page.extract_text() for page in pdf.pages]
assert all(len(text) > 150 for text in texts)
money = lambda value: '${:,.0f}'.format(value)

for member in read_json('src/data/team.json'):
    assert member['name'] in texts[18], member['name']
    if member.get('email'):
        assert member['email'] in texts[18], member['email']
for scenario in readiness['cooling']['cases']:
    for key in ['partialInitialFunding', 'additionalFounderContribution']:
        assert money(scenario[key]) in texts[11], key
    assert money(scenario['installedCoolingAllowance']) in texts[10]
for value in [readiness['hardware']['totalCost'], readiness['budget']['startupAllowance'], readiness['budget']['openingReserve']]:
    assert money(value) in texts[11], value
assert '50 years' in texts[5] and '1% annually' in texts[5] and 'BC LLC' in texts[5]
assert 'Supermicro' in texts[7] and money(readiness['hardware']['systemPrice']) in texts[7]
assert '225 kW' in texts[9]
assert '0 signed customer contracts' in texts[3] and '0 paid pilots' in texts[3]
assert 'Updated ROI: not established' in texts[13]
assert all('28.7%' not in text for i, text in enumerate(texts) if i != 14)
assert 'Historical' in texts[14]
assert all('72 GPUs' not in text and '$604,000' not in text and '$7.03' not in text for text in texts)
assert 'guaranteed return' not in '\n'.join(texts).lower()

links = [annotation.get_object().get('/A', {}).get('/URI') for page in pdf.pages for annotation in page.get('/Annots', [])]
for url in ['mailto:yasir@smarttec.dev', 'tel:+19185203823', 'https://www.smarttec.dev/investors', 'https://docs.nvidia.com/dgx/dgxb300-user-guide/introduction-to-dgxb300.html']:
    assert url in links, url

layout = read_json('tmp/pdfs/deck-layout.json')
for page in range(1, 27):
    boxes = [box for box in layout['boxes'] if box['page'] == page]
    for i, a in enumerate(boxes):
        x, y, w, h = a['box']
        for b in boxes[i + 1:]:
            xx, yy, ww, hh = b['box']
            overlap = min(x + w, xx + ww) - max(x, xx) > 2 and min(y + h, yy + hh) - max(y, yy) > 2
            assert not overlap, [page, a['text'], b['text']]
print('PASS: 26 pages, financial inputs, disclosures, team, links, artifact hash and text geometry.')
