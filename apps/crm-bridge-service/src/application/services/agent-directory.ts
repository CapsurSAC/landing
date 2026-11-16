import { type AgentLoad } from '../../domain/assignment-policy';
import { type ChatwootAgent, type ChatwootGateway } from '../ports/chatwoot-gateway';
import { type Clock } from '../ports/clock';

/** Vida de la caché de agentes y cargas (A9). */
export const AGENT_CACHE_TTL_MS = 60_000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Agentes de Chatwoot y su carga (conversaciones abiertas) con caché de 60 s. Las peticiones
 * concurrentes comparten la misma consulta. Tras cada asignación se suma 1 a la carga
 * cacheada del agente para que una ráfaga de leads no vaya entera al mismo asesor.
 */
export class AgentDirectory {
  private agentsCache: CacheEntry<ChatwootAgent[]> | null = null;
  private countsCache: CacheEntry<Map<number, number>> | null = null;
  private agentsInFlight: Promise<ChatwootAgent[]> | null = null;
  private countsInFlight: Promise<Map<number, number>> | null = null;

  constructor(
    private readonly gateway: ChatwootGateway,
    private readonly clock: Clock,
    private readonly ttlMs = AGENT_CACHE_TTL_MS,
  ) {}

  async agents(): Promise<ChatwootAgent[]> {
    const now = this.clock.now().getTime();
    if (this.agentsCache && this.agentsCache.expiresAt > now) {
      return this.agentsCache.value;
    }
    if (!this.agentsInFlight) {
      this.agentsInFlight = this.gateway
        .listAgents()
        .then((value) => {
          this.agentsCache = { value, expiresAt: this.clock.now().getTime() + this.ttlMs };
          return value;
        })
        .finally(() => {
          this.agentsInFlight = null;
        });
    }
    return this.agentsInFlight;
  }

  /** Disponibilidad y conversaciones abiertas por agente. */
  async loads(): Promise<Map<number, AgentLoad>> {
    const [agents, counts] = await Promise.all([this.agents(), this.openCounts()]);
    const loads = new Map<number, AgentLoad>();
    for (const agent of agents) {
      loads.set(agent.id, {
        agentId: agent.id,
        name: agent.name,
        available: agent.availabilityStatus === 'online',
        openConversations: counts.get(agent.id) ?? 0,
      });
    }
    return loads;
  }

  /** Nombre visible de un agente (null si no se conoce). */
  async agentName(agentId: number): Promise<string | null> {
    const agents = await this.agents();
    return agents.find((agent) => agent.id === agentId)?.name ?? null;
  }

  /** Suma una conversación a la carga cacheada del agente recién asignado. */
  recordAssignment(agentId: number): void {
    const counts = this.countsCache?.value;
    if (counts) {
      counts.set(agentId, (counts.get(agentId) ?? 0) + 1);
    }
  }

  private async openCounts(): Promise<Map<number, number>> {
    const now = this.clock.now().getTime();
    if (this.countsCache && this.countsCache.expiresAt > now) {
      return this.countsCache.value;
    }
    if (!this.countsInFlight) {
      this.countsInFlight = this.gateway
        .countOpenConversationsByAssignee()
        .then((value) => {
          this.countsCache = { value, expiresAt: this.clock.now().getTime() + this.ttlMs };
          return value;
        })
        .finally(() => {
          this.countsInFlight = null;
        });
    }
    return this.countsInFlight;
  }
}
