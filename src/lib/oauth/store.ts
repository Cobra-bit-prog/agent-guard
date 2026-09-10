export type OauthClient = {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  token_endpoint_auth_method: "none";
  created_at: string;
};

export type OauthAuthCode = {
  code_hash: string;
  client_id: string;
  user_id: string;
  agent_id: string;
  redirect_uri: string;
  code_challenge: string;
  scope: string;
  resource: string | null;
  expires_at: string;
  used_at: string | null;
};

export type OauthAccessToken = {
  token_hash: string;
  client_id: string;
  user_id: string;
  agent_id: string;
  scope: string;
  resource: string | null;
  expires_at: string;
  refresh_hash: string | null;
  refresh_expires_at: string | null;
  created_at: string;
};

export type OauthAgent = {
  id: string;
  user_id: string;
  name: string;
  chain: string;
  address: string;
  api_key: string;
  is_demo: boolean;
};

export type OauthStore = {
  insertClient(client: OauthClient): Promise<void>;
  getClient(clientId: string): Promise<OauthClient | null>;
  insertCode(code: OauthAuthCode): Promise<void>;
  getCode(codeHash: string): Promise<OauthAuthCode | null>;
  consumeCode(codeHash: string, usedAt: string): Promise<boolean>;
  insertToken(token: OauthAccessToken): Promise<void>;
  getToken(tokenHash: string): Promise<OauthAccessToken | null>;
  getTokenByRefreshHash(refreshHash: string): Promise<OauthAccessToken | null>;
  replaceToken(oldTokenHash: string, next: OauthAccessToken): Promise<void>;
  listAgentsForUser(userId: string): Promise<OauthAgent[]>;
  getAgentForUser(userId: string, agentId: string): Promise<OauthAgent | null>;
};

export function memoryOauthStore(seedAgents: OauthAgent[] = []): OauthStore {
  const clients = new Map<string, OauthClient>();
  const codes = new Map<string, OauthAuthCode>();
  const tokens = new Map<string, OauthAccessToken>();
  const agents = [...seedAgents];

  return {
    async insertClient(client) {
      clients.set(client.client_id, { ...client, redirect_uris: [...client.redirect_uris] });
    },
    async getClient(clientId) {
      const row = clients.get(clientId);
      return row ? { ...row, redirect_uris: [...row.redirect_uris] } : null;
    },
    async insertCode(code) {
      codes.set(code.code_hash, { ...code });
    },
    async getCode(codeHash) {
      const row = codes.get(codeHash);
      return row ? { ...row } : null;
    },
    async consumeCode(codeHash, usedAt) {
      const row = codes.get(codeHash);
      if (!row || row.used_at) return false;
      codes.set(codeHash, { ...row, used_at: usedAt });
      return true;
    },
    async insertToken(token) {
      tokens.set(token.token_hash, { ...token });
    },
    async getToken(tokenHash) {
      const row = tokens.get(tokenHash);
      return row ? { ...row } : null;
    },
    async getTokenByRefreshHash(refreshHash) {
      for (const row of tokens.values()) {
        if (row.refresh_hash === refreshHash) return { ...row };
      }
      return null;
    },
    async replaceToken(oldTokenHash, next) {
      tokens.delete(oldTokenHash);
      tokens.set(next.token_hash, { ...next });
    },
    async listAgentsForUser(userId) {
      return agents.filter((a) => a.user_id === userId).map((a) => ({ ...a }));
    },
    async getAgentForUser(userId, agentId) {
      const row = agents.find((a) => a.user_id === userId && a.id === agentId);
      return row ? { ...row } : null;
    },
  };
}
