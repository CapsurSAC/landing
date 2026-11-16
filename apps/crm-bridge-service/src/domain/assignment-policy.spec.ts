import { type AgentLoad, AssignmentPolicy, formatAssignee, pickLeastLoaded } from './assignment-policy';

const context = { brand: 'sis', promotionId: 'con-ia', campaignId: 'nov-2026' };

describe('AssignmentPolicy', () => {
  it('la primera regla que coincide gana', () => {
    const policy = AssignmentPolicy.fromJson(
      JSON.stringify([
        { match: { brand: 'sis', promotionId: 'otra' }, teamId: 1 },
        { match: { brand: 'sis' }, teamId: 2 },
        { match: {}, teamId: 3 },
      ]),
    );

    expect(policy.decide(context)).toEqual({ kind: 'team', teamId: 2 });
  });

  it('reparte los agentes en round-robin por regla', () => {
    const policy = AssignmentPolicy.fromJson(JSON.stringify([{ match: { brand: 'sis' }, agentIds: [10, 20, 30] }]));

    const picks = [1, 2, 3, 4].map(() => policy.decide(context));

    expect(picks).toEqual([
      { kind: 'agent', agentId: 10 },
      { kind: 'agent', agentId: 20 },
      { kind: 'agent', agentId: 30 },
      { kind: 'agent', agentId: 10 },
    ]);
  });

  it('coincide por campaña y cae al equipo por defecto si ninguna regla aplica', () => {
    const policy = AssignmentPolicy.fromJson(JSON.stringify([{ match: { campaignId: 'dic-2026' }, teamId: 5 }]), 9);

    expect(policy.decide(context)).toEqual({ kind: 'team', teamId: 9 });
    expect(policy.decide({ ...context, campaignId: 'dic-2026' })).toEqual({ kind: 'team', teamId: 5 });
  });

  it('sin reglas ni equipo por defecto no asigna', () => {
    expect(AssignmentPolicy.fromJson(undefined).decide(context)).toBeNull();
    expect(AssignmentPolicy.fromJson('   ').decide(context)).toBeNull();
  });

  it('una regla que coincide sin destino significa no asignar', () => {
    const policy = AssignmentPolicy.fromJson(JSON.stringify([{ match: { brand: 'sis' } }]), 9);

    expect(policy.decide(context)).toBeNull();
  });

  it('rechaza JSON inválido o con forma incorrecta', () => {
    expect(() => AssignmentPolicy.fromJson('{not json')).toThrow(/no es JSON válido/);
    expect(() => AssignmentPolicy.fromJson(JSON.stringify([{ teamId: 'x' }]))).toThrow(/inválido/);
  });

  it('una regla puede filtrar por sede', () => {
    const policy = AssignmentPolicy.fromJson(JSON.stringify([{ match: { campus: 'arequipa' }, teamId: 7 }]), 9);
    expect(policy.decide({ ...context, campus: 'arequipa' })).toEqual({ kind: 'team', teamId: 7 });
    expect(policy.decide({ ...context, campus: 'tacna' })).toEqual({ kind: 'team', teamId: 9 });
  });

  describe('least_loaded (A9)', () => {
    const load = (agentId: number, openConversations: number, available = true): AgentLoad => ({
      agentId,
      name: `agente-${agentId}`,
      available,
      openConversations,
    });

    it('elige al disponible con menos conversaciones abiertas', () => {
      const loads = new Map([
        [10, load(10, 5)],
        [20, load(20, 1)],
        [30, load(30, 0, false)],
      ]);
      expect(pickLeastLoaded([10, 20, 30], loads, 0)).toEqual({ agentId: 20, tied: 1 });
    });

    it('en empate reparte en turno rotatorio entre los empatados', () => {
      const policy = AssignmentPolicy.fromJson(JSON.stringify([{ match: { brand: 'sis' }, agentIds: [10, 20, 30] }]));
      const loads = new Map([
        [10, load(10, 2)],
        [20, load(20, 2)],
        [30, load(30, 4)],
      ]);
      const picks = [1, 2, 3].map(() => policy.decide(context, loads));
      expect(picks).toEqual([
        { kind: 'agent', agentId: 10 },
        { kind: 'agent', agentId: 20 },
        { kind: 'agent', agentId: 10 },
      ]);
    });

    it('ignora agentes que no están en la regla o que Chatwoot no devuelve', () => {
      const loads = new Map([
        [99, load(99, 0)],
        [10, load(10, 3)],
      ]);
      expect(pickLeastLoaded([10, 20], loads, 0)).toEqual({ agentId: 10, tied: 1 });
    });

    it('si nadie está disponible usa el equipo de la regla o, sin equipo, el turno rotatorio', () => {
      const offline = new Map([
        [10, load(10, 0, false)],
        [20, load(20, 0, false)],
      ]);
      expect(pickLeastLoaded([10, 20], offline, 0)).toBeNull();

      const withTeam = AssignmentPolicy.fromJson(JSON.stringify([{ match: {}, agentIds: [10, 20], teamId: 4 }]));
      expect(withTeam.decide(context, offline)).toEqual({ kind: 'team', teamId: 4 });

      const withoutTeam = AssignmentPolicy.fromJson(JSON.stringify([{ match: {}, agentIds: [10, 20] }]));
      expect(withoutTeam.decide(context, offline)).toEqual({ kind: 'agent', agentId: 10 });
      expect(withoutTeam.decide(context, offline)).toEqual({ kind: 'agent', agentId: 20 });
    });

    it('solo pide cargas si la regla que aplica reparte entre agentes', () => {
      const policy = AssignmentPolicy.fromJson(
        JSON.stringify([
          { match: { promotionId: 'con-ia' }, agentIds: [1, 2] },
          { match: {}, teamId: 3 },
        ]),
      );
      expect(policy.needsAgentLoads(context)).toBe(true);
      expect(policy.needsAgentLoads({ ...context, promotionId: 'otra' })).toBe(false);
    });
  });

  it('formatea el destino para guardarlo en el vínculo', () => {
    expect(formatAssignee({ kind: 'team', teamId: 4 })).toBe('team:4');
    expect(formatAssignee({ kind: 'agent', agentId: 8 })).toBe('agent:8');
  });
});
