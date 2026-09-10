/**
 * Model planner, wired up.
 *
 * The page ships every control and the whole catalogue in the HTML, so the
 * form is readable and the method is checkable without this module. What this
 * adds is the live arithmetic.
 *
 * The catalogue is a build-time snapshot. On load it tries OpenRouter for a
 * fresher list, and uses it only to add models the snapshot has not seen and
 * that carry the architecture we need — a refresh that cannot characterise a
 * model does not add it, because a row with guessed geometry would be worse
 * than a row that is a week old.
 */

import catalogue from '../data/models.json';
import { accelerators, precisions, workloads } from '../data/accelerators';
import {
  plan, fitTo, fmtBytes, fmtParams, kvPerToken, ASSUMED_PUE,
  type PlannerModel,
} from './model-planner';

const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document): T | null =>
  root.querySelector<T>(sel);

export function initPlanner(): void {
  const form = $<HTMLFormElement>('[data-planner]');
  if (!form) return;

  const modelSel = $<HTMLSelectElement>('#mp-model', form);
  const search = $<HTMLInputElement>('#mp-search', form);
  const precSel = $<HTMLSelectElement>('#mp-precision', form);
  const workSel = $<HTMLSelectElement>('#mp-workload', form);
  const ctxIn = $<HTMLInputElement>('#mp-context', form);
  const concIn = $<HTMLInputElement>('#mp-concurrency', form);
  if (!modelSel || !precSel || !workSel || !ctxIn || !concIn) return;

  const models = new Map<string, PlannerModel>(
    (catalogue.models as PlannerModel[]).map((m) => [m.id, m]),
  );
  /** Kept so the filter can rebuild the list without losing anything. */
  const allOptions = Array.from(modelSel.options).map((o) => ({
    value: o.value, text: o.textContent ?? '', lower: (o.textContent ?? '').toLowerCase(),
  }));

  const text = (sel: string, value: string): void => {
    const el = $(sel, form);
    if (el) el.textContent = value;
  };

  function clearResults(message: string): void {
    for (const selector of ['total', 'weights', 'kv', 'overhead', 'ram', 'storage', 'training']) {
      text(`[data-out-${selector}]`, '—');
    }
    text('[data-out-model]', message);
    text('[data-out-formula]', '');
    text('#mp-model-hint', models.get(modelSel!.value)?.name ?? 'No matching models. Clear or change the search.');
    for (const card of document.querySelectorAll<HTMLElement>('[data-accel]')) {
      for (const key of ['count', 'mem', 'power', 'facility', 'rack-power']) {
        const el = card.querySelector(`[data-accel-${key}]`);
        if (el) el.textContent = '—';
      }
      const unit = card.querySelector('[data-accel-unit]');
      if (unit) unit.textContent = 'awaiting valid inputs';
      const note = card.querySelector('[data-accel-note]');
      if (note) note.textContent = '';
    }
  }

  function render(): void {
    const model = models.get(modelSel!.value);
    if (!model) { clearResults('No matching models. Clear or change the search to calculate a deployment.'); return; }
    const precision = precisions.find((p) => p.id === precSel!.value) ?? precisions[0];
    const workload = workloads.find((w) => w.id === workSel!.value) ?? workloads[0];

    // A context longer than the model supports is not a sizing question, it is
    // a mistake — clamp it and say so rather than quietly sizing fiction.
    const maxCtx = model.ctx ?? 131072;
    const askedCtx = Number(ctxIn!.value);
    const concurrency = Number(concIn!.value);
    const validContext = ctxIn!.value.trim() !== '' && Number.isSafeInteger(askedCtx) && askedCtx >= 512;
    const validConcurrency = concIn!.value.trim() !== '' && Number.isSafeInteger(concurrency) && concurrency >= 1;
    ctxIn!.setAttribute('aria-invalid', String(!validContext));
    concIn!.setAttribute('aria-invalid', String(!validConcurrency));
    if (!validContext || !validConcurrency) {
      clearResults(!validContext ? 'Enter a whole-number context of at least 512 tokens.' : 'Enter at least 1 concurrent request, using a whole number.');
      return;
    }
    const contextTokens = Math.min(askedCtx, maxCtx);
    const clamped = askedCtx > maxCtx;

    const result = plan({ model, precision, workload, contextTokens, concurrency });

    text('[data-out-total]', fmtBytes(result.totalBytes));
    text('[data-out-weights]', fmtBytes(result.weightsBytes));
    text('[data-out-kv]', fmtBytes(result.kvBytes));
    text('[data-out-overhead]', fmtBytes(result.overheadBytes));
    text('[data-out-ram]', `${Math.ceil(result.hostRamGb)} GB`);
    text('[data-out-storage]', `${Math.ceil(result.storageGb)} GB`);

    const trainingRow = $<HTMLElement>('[data-out-training-row]', form!);
    if (trainingRow) {
      trainingRow.hidden = result.trainingBytes <= 0;
      text('[data-out-training]', fmtBytes(result.trainingBytes));
    }

    text(
      '[data-out-model]',
      `${model.name} · ${fmtParams(model.params)} parameters · ${model.layers} layers · `
      + `${model.kvHeads} KV heads · ${contextTokens.toLocaleString()} tokens × ${concurrency}`
      + (clamped ? ` (clamped to the model's ${maxCtx.toLocaleString()}-token limit)` : ''),
    );

    const kvTok = kvPerToken(model, 2);
    text(
      '[data-out-formula]',
      `Weights = ${fmtParams(model.params)} × ${precision.bytes} B. `
      + `KV = 2 × ${model.layers} × ${model.kvHeads} × ${model.headDim} × 2 B `
      + `= ${(kvTok / 1024).toFixed(0)} kB per token, × ${contextTokens.toLocaleString()} × ${concurrency}.`,
    );

    text('[data-hint="precision"]', precision.note);
    text('[data-hint="workload"]', workload.note);
    text(
      '[data-hint="context"]',
      model.ctx
        ? `This model publishes a ${model.ctx.toLocaleString()}-token limit.`
        : 'No published context limit found for this model.',
    );
    const modelHint = $<HTMLElement>('#mp-model-hint', form!);
    if (modelHint) {
      modelHint.textContent = model.experts
        ? `Mixture of experts — ${model.experts} experts, all resident in memory.`
        : `Dense model. Hugging Face: ${model.hf}`;
    }

    for (const accel of accelerators) {
      const card = $<HTMLElement>(`[data-accel="${accel.id}"]`, form!.closest('.doc') ?? document);
      if (!card) continue;
      const fit = fitTo(result, accel, model);
      const set = (s: string, v: string) => { const el = $(s, card); if (el) el.textContent = v; };

      if (fit.count === null) {
        set('[data-accel-count]', '—');
        set('[data-accel-unit]', 'sized by the vendor');
        set('[data-accel-mem]', '—');
        set('[data-accel-power]', '—');
        set('[data-accel-facility]', '—');
      } else {
        set('[data-accel-count]', String(fit.count));
        set('[data-accel-unit]', fit.count === 1 ? 'accelerator' : 'accelerators');
        set('[data-accel-mem]', `${fit.totalMemoryGb.toLocaleString()} GB`);
        set('[data-accel-power]', `${fit.powerKw.toFixed(1)} kW`);
        set('[data-accel-facility]', `${(fit.powerKw * ASSUMED_PUE).toFixed(1)} kW`);
      }
      set('[data-accel-note]', fit.notes.join(' '));
      if (accel.rackOf && fit.count !== null) {
        const racks = Math.ceil(fit.count / accel.rackOf);
        set('[data-accel-rack-power]', `${racks} ${racks === 1 ? 'rack' : 'racks'} · ${(racks * accel.rackOf * accel.tdpW / 1000).toFixed(1)} kW GPU-only`);
      }
    }
  }

  // Filtering rebuilds the option list rather than hiding options, because
  // hidden <option> support is inconsistent across browsers.
  function filter(): void {
    const q = (search?.value ?? '').trim().toLowerCase();
    const keep = q ? allOptions.filter((o) => o.lower.includes(q)) : allOptions;
    const current = modelSel!.value;
    modelSel!.replaceChildren(...keep.map((o) => {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.text;
      return opt;
    }));
    if (keep.some((o) => o.value === current)) modelSel!.value = current;
    else if (keep.length) modelSel!.value = keep[0].value;
    modelSel!.disabled = keep.length === 0;
    render();
  }

  form.addEventListener('input', (e) => {
    if (e.target === search) { filter(); return; }
    render();
  });
  form.addEventListener('change', render);
  // A form with no submit target must never navigate.
  form.addEventListener('submit', (e) => e.preventDefault());

  render();
  void refresh(models, allOptions, modelSel, render);
}

/**
 * Try OpenRouter for anything the snapshot has not seen.
 *
 * Best-effort in every direction: a failed call, a blocked origin or a model
 * we cannot characterise all leave the page exactly as it rendered.
 */
async function refresh(
  models: Map<string, PlannerModel>,
  allOptions: { value: string; text: string; lower: string }[],
  select: HTMLSelectElement,
  render: () => void,
): Promise<void> {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', { headers: { Accept: 'application/json' } });
    if (!res.ok) return;
    const body = (await res.json()) as { data?: { id: string; name: string; hugging_face_id?: string | null; context_length?: number }[] };
    const live = body.data ?? [];

    // Only models we can size: a new entry needs the same architecture figures
    // the snapshot carries, and we will not invent them from a name.
    const known = new Set(models.keys());
    const knownRepos = new Set([...models.values()].map((m) => m.hf));
    const additions = live.filter((m) => m.hugging_face_id && !known.has(m.id) && !knownRepos.has(m.hugging_face_id));
    if (!additions.length) return;

    const marker = document.querySelector<HTMLElement>('[data-planner]')?.closest('section');
    if (marker) {
      const note = document.createElement('p');
      note.className = 'field__hint';
      note.style.marginTop = 'var(--s-3)';
      note.textContent =
        `OpenRouter currently lists ${additions.length} further self-hostable `
        + `${additions.length === 1 ? 'model' : 'models'} that this snapshot has not been `
        + 'characterised against yet. They are left out rather than sized from their names.';
      marker.appendChild(note);
    }
    void select; void allOptions; void render;
  } catch {
    // Offline, blocked, or CORS. The snapshot is already on screen.
  }
}
