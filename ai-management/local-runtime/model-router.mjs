function clamp(value, minimum = 0, maximum = 100) {
  return Math.max(minimum, Math.min(maximum, Number(value || 0)));
}

export function estimateTokens(value) {
  const text = Array.isArray(value)
    ? value.map(item => `${item?.role || ''}: ${item?.content || ''}`).join('\n')
    : typeof value === 'object' && value !== null
      ? JSON.stringify(value)
      : String(value || '');
  return Math.max(1, Math.ceil(text.length / 4));
}

function freshnessPenalty(lastSeen, now = new Date()) {
  const time = Date.parse(lastSeen || '');
  if (!Number.isFinite(time)) return -50;
  const age = now.getTime() - time;
  if (age < 0) return -20;
  if (age <= 2 * 60 * 1000) return 0;
  if (age <= 10 * 60 * 1000) return -8;
  if (age <= 60 * 60 * 1000) return -25;
  return -60;
}

function taskProfile(job = {}) {
  const requested = String(job.payload?.task_profile || job.metadata?.task_profile || '').toLowerCase();
  const prompt = `${job.payload?.prompt || ''} ${JSON.stringify(job.payload?.messages || [])}`.toLowerCase();
  return {
    reasoning: requested === 'reasoning' || /reason|investigat|analyse|analyze|compare|conclusion|evidence/.test(prompt),
    speed: requested === 'speed' || /summari[sz]e|classify|extract|tag|short/.test(prompt),
    longContext: requested === 'long-context' || /dossier|full document|archive|long context|many pages/.test(prompt),
    coding: requested === 'coding' || /code|javascript|python|sql|bug|test/.test(prompt)
  };
}

export function modelCompatibility(resource, job, { now = new Date() } = {}) {
  const metadata = resource?.metadata || {};
  const reasons = [];
  if (resource?.capability_types?.includes('llm') !== true) reasons.push('not-an-llm-resource');
  if (metadata.local !== true) reasons.push('not-owner-local');
  if (!metadata.endpoint || !metadata.model_id) reasons.push('local-model-metadata-missing');

  const promptTokens = estimateTokens(job.payload?.messages || job.payload?.prompt || job.payload || '');
  const outputTokens = Math.max(1, Number(job.payload?.max_tokens || job.payload?.max_completion_tokens || 1024));
  const requiredContext = promptTokens + outputTokens + 512;
  const contextLength = Number(metadata.context_length || 0);
  if (contextLength && contextLength < requiredContext) reasons.push('context-window-too-small');

  const availableVram = Number(metadata.available_gpu_memory_gb || 0);
  const estimatedVram = Number(metadata.estimated_vram_gb || 0);
  const cpuFallbackAllowed = job.requirements?.allow_cpu_fallback !== false;
  if (estimatedVram > 0 && availableVram > 0 && estimatedVram > availableVram && !cpuFallbackAllowed) reasons.push('insufficient-vram');

  const profile = taskProfile(job);
  const parameters = Number(metadata.parameters_billion || 0);
  let adjustment = freshnessPenalty(resource.last_health_check || metadata.last_seen, now);
  if (profile.reasoning) adjustment += parameters >= 14 ? 14 : parameters >= 7 ? 6 : -10;
  if (profile.speed) adjustment += parameters && parameters <= 14 ? 10 : parameters > 30 ? -8 : 3;
  if (profile.longContext) adjustment += contextLength >= 65536 ? 15 : contextLength >= 32768 ? 6 : -12;
  if (profile.coding) adjustment += /coder|code|qwen|deepseek/i.test(`${metadata.model_id} ${resource.service_name}`) ? 12 : 0;
  if (availableVram > 0 && estimatedVram > 0) adjustment += availableVram >= estimatedVram ? 8 : -12;
  if (/q4|4bit|int4/i.test(String(metadata.quantization || ''))) adjustment += profile.speed ? 6 : -1;
  if (/q8|8bit|fp16|bf16/i.test(String(metadata.quantization || ''))) adjustment += profile.reasoning ? 5 : 0;
  adjustment += clamp(Number(resource.privacy_score || 0) - 90, -10, 10);

  return {
    eligible: reasons.length === 0,
    reasons,
    adjustment: clamp(adjustment, -75, 30),
    prompt_tokens_estimate: promptTokens,
    requested_output_tokens: outputTokens,
    required_context: requiredContext,
    context_length: contextLength,
    parameters_billion: parameters,
    available_vram_gb: availableVram,
    estimated_vram_gb: estimatedVram,
    profile
  };
}

export function routeLocalModel(resources = [], job = {}, options = {}) {
  const eligible = [];
  const excluded = [];
  for (const resource of resources) {
    const compatibility = modelCompatibility(resource, job, options);
    if (!compatibility.eligible) {
      excluded.push({ resource_id: resource.resource_id, reasons: compatibility.reasons });
      continue;
    }
    const base = Number(resource.quality_score || 0) * 0.4 + Number(resource.reliability_score || 0) * 0.2 + Number(resource.latency_score || 0) * 0.2 + Number(resource.privacy_score || 0) * 0.2;
    eligible.push({ resource, compatibility, route_score: Number(clamp(base + compatibility.adjustment).toFixed(4)) });
  }
  eligible.sort((left, right) => right.route_score - left.route_score || String(left.resource.resource_id).localeCompare(String(right.resource.resource_id)));
  return { selected: eligible[0] || null, eligible, excluded };
}

export function localModelScoreAdjuster(resource, job, context = {}) {
  if (!resource?.capability_types?.includes('llm')) return 0;
  const result = modelCompatibility(resource, job, { now: context.now instanceof Date ? context.now : new Date(context.now || Date.now()) });
  return result.eligible ? result.adjustment : -100;
}

export const modelRouterInternals = { clamp, freshnessPenalty, taskProfile };
