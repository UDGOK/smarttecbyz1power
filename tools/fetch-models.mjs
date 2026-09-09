/**
 * Build the model catalogue for the planner.
 *
 * Three sources, in order of authority:
 *   1. OpenRouter's model list — the catalogue the client is choosing from.
 *   2. `hugging_face_id` on each entry — the only honest test of whether a
 *      model can be self-hosted at all. A model with no weights to download
 *      cannot be racked in a colocation hall, so it is not in this catalogue.
 *   3. The Hugging Face API and each repo's config.json — exact parameter
 *      counts from safetensors metadata, and exact layer / KV-head / head-dim
 *      figures. This is what makes the planner arithmetic rather than a
 *      heuristic: nothing below is inferred from a model's name.
 *
 * Anything that cannot be characterised from real metadata is dropped rather
 * than estimated. Run: node tools/fetch-models.mjs
 */
import { writeFileSync } from 'node:fs';

const OR = 'https://openrouter.ai/api/v1/models';
const CONCURRENCY = 8;

const get = async (url, asJson = true) => {
  const r = await fetch(url, { headers: { Accept: 'application/json' }, redirect: 'follow' });
  if (!r.ok) return null;
  return asJson ? r.json().catch(() => null) : r.text();
};

const run = async (items, worker) => {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (i < items.length) {
      const n = i++;
      try { out[n] = await worker(items[n], n); } catch { out[n] = null; }
    }
  }));
  return out;
};

const catalogue = await get(OR);
if (!catalogue?.data) { console.error('OpenRouter list unavailable'); process.exit(1); }

// One entry per Hugging Face repo: OpenRouter lists :free and :batch variants
// of the same weights, which are the same box of hardware.
const byRepo = new Map();
for (const m of catalogue.data) {
  const hf = m.hugging_face_id;
  if (!hf) continue;
  const prev = byRepo.get(hf);
  if (!prev || m.id.length < prev.id.length) byRepo.set(hf, m);
}
const candidates = [...byRepo.entries()];
console.error(`openrouter: ${catalogue.data.length} models, ${candidates.length} self-hostable repos`);

let done = 0;
const results = await run(candidates, async ([hf, m]) => {
  const [meta, cfg] = await Promise.all([
    get(`https://huggingface.co/api/models/${hf}`),
    get(`https://huggingface.co/${hf}/resolve/main/config.json`),
  ]);
  if (++done % 25 === 0) console.error(`  ${done}/${candidates.length}`);
  const params = meta?.safetensors?.total;
  if (!params || !cfg) return null;

  const text = cfg.text_config ?? cfg;
  const layers = text.num_hidden_layers ?? text.n_layer ?? text.num_layers;
  const heads = text.num_attention_heads ?? text.n_head;
  const kvHeads = text.num_key_value_heads ?? heads;
  const hidden = text.hidden_size ?? text.n_embd;
  const headDim = text.head_dim ?? (hidden && heads ? Math.round(hidden / heads) : null);
  if (!layers || !kvHeads || !headDim) return null;

  return {
    id: m.id,
    name: m.name,
    hf,
    params,
    ctx: m.context_length ?? text.max_position_embeddings ?? null,
    layers,
    kvHeads,
    headDim,
    hidden: hidden ?? null,
    // Mixture-of-experts: every expert has to be resident in memory even
    // though only some are active per token, so the memory figure follows the
    // total while the compute figure follows the active count.
    experts: text.num_experts ?? text.n_routed_experts ?? text.num_local_experts ?? null,
    dtype: text.torch_dtype ?? null,
    downloads: meta?.downloads ?? 0,
  };
});

const models = results.filter(Boolean).sort((a, b) => b.downloads - a.downloads);
console.error(`characterised: ${models.length} of ${candidates.length}`);
writeFileSync('src/data/models.json', JSON.stringify({
  fetched: new Date().toISOString().slice(0, 10),
  source: 'openrouter.ai/api/v1/models, cross-referenced with the Hugging Face API and each repo config.json',
  models,
}, null, 0) + '\n');
console.error('wrote src/data/models.json');
