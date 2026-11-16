import { z } from 'zod';

/**
 * Reglas de asignación configurables por `ASSIGNMENT_RULES_JSON`:
 * array ordenado; la primera regla cuyo `match` coincide gana.
 * - `agentIds`: se reparten entre esos agentes. Con `round_robin` (por defecto) en turno
 *   rotatorio; con `least_loaded` (A9) al agente disponible con menos conversaciones abiertas
 *   (empate → turno rotatorio). Estado en memoria por regla: con varias réplicas el reparto
 *   es aproximado.
 * - `teamId`: se asigna al equipo (y es el respaldo de `least_loaded` si no hay nadie disponible).
 * - Sin regla coincidente: equipo por defecto (`CHATWOOT_DEFAULT_TEAM_ID`) si existe; si no, no se asigna.
 */
export const AssignmentRuleSchema = z.object({
  match: z
    .object({
      brand: z.string().min(1).optional(),
      promotionId: z.string().min(1).optional(),
      campaignId: z.string().min(1).optional(),
      campus: z.string().min(1).optional(),
    })
    .default({}),
  teamId: z.number().int().positive().optional(),
  agentIds: z.array(z.number().int().positive()).optional(),
});
export type AssignmentRule = z.infer<typeof AssignmentRuleSchema>;

export const AssignmentRulesSchema = z.array(AssignmentRuleSchema);

export type AssignmentStrategy = 'round_robin' | 'least_loaded';

export interface AssignmentContext {
  brand: string;
  promotionId: string;
  campaignId: string | null;
  campus?: string | null;
}

export type AssignmentDecision = { kind: 'team'; teamId: number } | { kind: 'agent'; agentId: number };

/** Carga de un agente de Chatwoot (A9). */
export interface AgentLoad {
  agentId: number;
  /** Nombre visible (`available_name` o `name`). */
  name: string | null;
  /** `availability_status === 'online'`. */
  available: boolean;
  openConversations: number;
}

export function formatAssignee(decision: AssignmentDecision): string {
  return decision.kind === 'team' ? `team:${decision.teamId}` : `agent:${decision.agentId}`;
}

/**
 * Elige al agente disponible con menos conversaciones abiertas entre `candidates`.
 * Empate → turno rotatorio con `cursor` sobre los empatados (en el orden de la regla).
 * Devuelve null si ningún candidato está disponible.
 */
export function pickLeastLoaded(
  candidates: readonly number[],
  loads: ReadonlyMap<number, AgentLoad>,
  cursor: number,
): { agentId: number; tied: number } | null {
  const available = candidates.filter((agentId) => loads.get(agentId)?.available === true);
  if (available.length === 0) {
    return null;
  }
  const loadOf = (agentId: number): number => loads.get(agentId)?.openConversations ?? 0;
  const minimum = Math.min(...available.map(loadOf));
  const tied = available.filter((agentId) => loadOf(agentId) === minimum);
  const agentId = tied[cursor % tied.length];
  return agentId === undefined ? null : { agentId, tied: tied.length };
}

export class AssignmentPolicy {
  private readonly cursors = new Map<number, number>();

  constructor(
    private readonly rules: readonly AssignmentRule[],
    private readonly defaultTeamId: number | undefined = undefined,
  ) {}

  /** Construye la política desde texto JSON. Lanza si el JSON es inválido. */
  static fromJson(json: string | undefined, defaultTeamId?: number): AssignmentPolicy {
    if (!json || json.trim().length === 0) {
      return new AssignmentPolicy([], defaultTeamId);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (error) {
      throw new Error(`ASSIGNMENT_RULES_JSON no es JSON válido: ${error instanceof Error ? error.message : String(error)}`);
    }
    const result = AssignmentRulesSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(`ASSIGNMENT_RULES_JSON inválido: ${result.error.message}`);
    }
    return new AssignmentPolicy(result.data, defaultTeamId);
  }

  /** `true` si la regla que aplica reparte entre agentes (solo entonces hacen falta las cargas). */
  needsAgentLoads(context: AssignmentContext): boolean {
    const found = this.findRule(context);
    return Boolean(found?.rule.agentIds && found.rule.agentIds.length > 0);
  }

  /**
   * Decide el destino. Sin `loads` reparte en turno rotatorio; con `loads` (estrategia
   * `least_loaded`) elige al agente disponible con menos carga. Si nadie de la regla está
   * disponible, usa el `teamId` de la regla o, si no hay, el turno rotatorio.
   */
  decide(context: AssignmentContext, loads?: ReadonlyMap<number, AgentLoad>): AssignmentDecision | null {
    const found = this.findRule(context);
    if (!found) {
      return this.defaultTeamId !== undefined ? { kind: 'team', teamId: this.defaultTeamId } : null;
    }
    const { index, rule } = found;
    if (rule.agentIds && rule.agentIds.length > 0) {
      if (loads) {
        const cursor = this.cursors.get(index) ?? 0;
        const picked = pickLeastLoaded(rule.agentIds, loads, cursor);
        if (picked) {
          this.cursors.set(index, cursor + 1);
          return { kind: 'agent', agentId: picked.agentId };
        }
        if (rule.teamId !== undefined) {
          return { kind: 'team', teamId: rule.teamId };
        }
      }
      const agentId = this.roundRobin(index, rule.agentIds);
      if (agentId !== undefined) {
        return { kind: 'agent', agentId };
      }
    }
    if (rule.teamId !== undefined) {
      return { kind: 'team', teamId: rule.teamId };
    }
    // Regla que coincide sin destino: decisión explícita de no asignar.
    return null;
  }

  private roundRobin(index: number, agentIds: readonly number[]): number | undefined {
    const cursor = this.cursors.get(index) ?? 0;
    this.cursors.set(index, (cursor + 1) % agentIds.length);
    return agentIds[cursor % agentIds.length];
  }

  private findRule(context: AssignmentContext): { index: number; rule: AssignmentRule } | null {
    for (let index = 0; index < this.rules.length; index += 1) {
      const rule = this.rules[index];
      if (rule && this.matches(rule, context)) {
        return { index, rule };
      }
    }
    return null;
  }

  private matches(rule: AssignmentRule, context: AssignmentContext): boolean {
    const { brand, promotionId, campaignId, campus } = rule.match;
    if (brand !== undefined && brand !== context.brand) {
      return false;
    }
    if (promotionId !== undefined && promotionId !== context.promotionId) {
      return false;
    }
    if (campaignId !== undefined && campaignId !== context.campaignId) {
      return false;
    }
    if (campus !== undefined && campus !== (context.campus ?? null)) {
      return false;
    }
    return true;
  }
}
