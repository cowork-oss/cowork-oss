export type DispatchRole = {
  displayName: string;
  description?: string | null;
  capabilities?: string[];
  systemPrompt?: string | null;
  soul?: string | null;
};

export type DispatchParentTask = {
  title: string;
  prompt: string;
};

export type DispatchPromptOptions = {
  planSummary?: string;
};

const buildSoulSummary = (soul?: string): string | null => {
  if (!soul) return null;
  try {
    const parsed = JSON.parse(soul) as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof parsed.name === 'string') parts.push(`Name: ${parsed.name}`);
    if (typeof parsed.role === 'string') parts.push(`Role: ${parsed.role}`);
    if (typeof parsed.personality === 'string') parts.push(`Personality: ${parsed.personality}`);
    if (typeof parsed.communicationStyle === 'string') parts.push(`Style: ${parsed.communicationStyle}`);
    if (Array.isArray(parsed.focusAreas)) parts.push(`Focus: ${parsed.focusAreas.join(', ')}`);
    if (Array.isArray(parsed.strengths)) parts.push(`Strengths: ${parsed.strengths.join(', ')}`);
    if (parts.length === 0) {
      return null;
    }
    return parts.join('\n');
  } catch {
    return soul;
  }
};

export const buildAgentDispatchPrompt = (
  role: DispatchRole,
  parentTask: DispatchParentTask,
  options?: DispatchPromptOptions
): string => {
  const lines: string[] = [
    `You are ${role.displayName}${role.description ? ` — ${role.description}` : ''}.`,
  ];

  if (role.capabilities && role.capabilities.length > 0) {
    lines.push(`Capabilities: ${role.capabilities.join(', ')}`);
  }

  if (role.systemPrompt) {
    lines.push('System guidance:');
    lines.push(role.systemPrompt);
  }

  const soulSummary = buildSoulSummary(role.soul || undefined);
  if (soulSummary) {
    lines.push('Role notes:');
    lines.push(soulSummary);
  }

  if (options?.planSummary) {
    lines.push('');
    lines.push('Main agent plan summary (context only):');
    lines.push(options.planSummary);
  }

  lines.push('');
  lines.push(`Parent task: ${parentTask.title}`);
  lines.push('Request:');
  lines.push(parentTask.prompt);
  lines.push('');
  lines.push('Deliverables:');
  lines.push('- Provide a concise summary of your findings.');
  lines.push('- Call out risks or open questions.');
  lines.push('- Recommend next steps.');

  return lines.join('\n');
};
