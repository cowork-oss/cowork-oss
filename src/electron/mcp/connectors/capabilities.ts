import type { MCPServerConfig } from "../types";
import type { ConnectorOAuthProvider } from "../oauth/connector-oauth";

export type IntegrationAuthMethod = "api_key" | "oauth";

export type ConnectorCapabilityId =
  | "salesforce"
  | "jira"
  | "hubspot"
  | "zendesk"
  | "servicenow"
  | "outreach"
  | "docusign"
  | "linear"
  | "asana"
  | "okta"
  | "resend"
  | "google-calendar"
  | "google-drive"
  | "gmail"
  | "google-workspace"
  | "slack";

export type Tier1IntegrationProvider =
  | "resend"
  | "slack"
  | "gmail"
  | "google-calendar"
  | "google-drive"
  | "google-workspace"
  | "jira"
  | "linear"
  | "hubspot"
  | "salesforce"
  | "zendesk"
  | "servicenow"
  | "outreach"
  | "docusign";

export interface IntegrationLinkSet {
  dashboard?: string;
  create_api_key?: string;
  api_keys_docs?: string;
  oauth_docs?: string;
  webhooks_docs?: string;
}

export interface IntegrationInputHint {
  field: string;
  label: string;
  prompt: string;
  create_url?: string;
  docs_url?: string;
  sensitive?: boolean;
}

export interface ConnectorCapability {
  id: ConnectorCapabilityId;
  name: string;
  registryEntryId: string;
  authMethods: IntegrationAuthMethod[];
  oauthProvider?: ConnectorOAuthProvider;
  readinessAny: string[][];
  readinessByAuth?: Partial<Record<IntegrationAuthMethod, string[][]>>;
  healthTool?: string;
  links: IntegrationLinkSet;
  inputHints?: Record<string, IntegrationInputHint>;
  supportsInbound?: boolean;
  tier1?: boolean;
}

const CONNECTOR_SCRIPT_PATH_REGEX =
  /(?:^|[\\/])connectors[\\/]([^\\/]+)-mcp[\\/]dist[\\/]index\.js$/i;

const CAPABILITIES: Record<ConnectorCapabilityId, ConnectorCapability> = {
  salesforce: {
    id: "salesforce",
    name: "Salesforce",
    registryEntryId: "salesforce",
    authMethods: ["api_key", "oauth"],
    oauthProvider: "salesforce",
    readinessAny: [
      ["SALESFORCE_INSTANCE_URL", "SALESFORCE_ACCESS_TOKEN"],
      [
        "SALESFORCE_INSTANCE_URL",
        "SALESFORCE_CLIENT_ID",
        "SALESFORCE_CLIENT_SECRET",
        "SALESFORCE_REFRESH_TOKEN",
      ],
    ],
    readinessByAuth: {
      api_key: [["SALESFORCE_INSTANCE_URL", "SALESFORCE_ACCESS_TOKEN"]],
      oauth: [["SALESFORCE_INSTANCE_URL", "SALESFORCE_ACCESS_TOKEN", "SALESFORCE_REFRESH_TOKEN"]],
    },
    healthTool: "salesforce.health",
    links: {
      dashboard: "https://login.salesforce.com",
      oauth_docs: "https://help.salesforce.com/s/articleView?id=sf.remoteaccess_oauth_web_server_flow.htm",
    },
    tier1: true,
  },
  jira: {
    id: "jira",
    name: "Jira",
    registryEntryId: "jira",
    authMethods: ["api_key", "oauth"],
    oauthProvider: "jira",
    readinessAny: [
      ["JIRA_BASE_URL", "JIRA_ACCESS_TOKEN"],
      ["JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_API_TOKEN"],
    ],
    readinessByAuth: {
      api_key: [["JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_API_TOKEN"]],
      oauth: [["JIRA_BASE_URL", "JIRA_ACCESS_TOKEN"]],
    },
    healthTool: "jira.health",
    links: {
      dashboard: "https://admin.atlassian.com",
      create_api_key: "https://id.atlassian.com/manage-profile/security/api-tokens",
      api_keys_docs: "https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/",
      oauth_docs: "https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/",
    },
    inputHints: {
      JIRA_BASE_URL: {
        field: "JIRA_BASE_URL",
        label: "Jira base URL",
        prompt: "Provide your Jira site URL (for example https://your-company.atlassian.net).",
        docs_url: "https://support.atlassian.com/jira-software-cloud/docs/find-your-jira-site-url/",
      },
    },
    tier1: true,
  },
  hubspot: {
    id: "hubspot",
    name: "HubSpot",
    registryEntryId: "hubspot",
    authMethods: ["api_key", "oauth"],
    oauthProvider: "hubspot",
    readinessAny: [["HUBSPOT_ACCESS_TOKEN"]],
    readinessByAuth: {
      api_key: [["HUBSPOT_ACCESS_TOKEN"]],
      oauth: [["HUBSPOT_ACCESS_TOKEN", "HUBSPOT_REFRESH_TOKEN"]],
    },
    healthTool: "hubspot.health",
    links: {
      dashboard: "https://app.hubspot.com",
      create_api_key: "https://developers.hubspot.com/docs/guides/apps/private-apps/overview",
      api_keys_docs: "https://developers.hubspot.com/docs/guides/apps/private-apps/overview",
      oauth_docs: "https://developers.hubspot.com/docs/guides/apps/authentication/oauth-quickstart-guide",
    },
    tier1: true,
  },
  zendesk: {
    id: "zendesk",
    name: "Zendesk",
    registryEntryId: "zendesk",
    authMethods: ["api_key", "oauth"],
    oauthProvider: "zendesk",
    readinessAny: [
      ["ZENDESK_BASE_URL", "ZENDESK_ACCESS_TOKEN"],
      ["ZENDESK_SUBDOMAIN", "ZENDESK_ACCESS_TOKEN"],
      ["ZENDESK_BASE_URL", "ZENDESK_EMAIL", "ZENDESK_API_TOKEN"],
      ["ZENDESK_SUBDOMAIN", "ZENDESK_EMAIL", "ZENDESK_API_TOKEN"],
    ],
    healthTool: "zendesk.health",
    links: {
      dashboard: "https://admin.zendesk.com",
      api_keys_docs: "https://support.zendesk.com/hc/en-us/articles/4408831452954",
      oauth_docs: "https://developer.zendesk.com/documentation/integration-services/apps/oauth/",
    },
    tier1: true,
  },
  servicenow: {
    id: "servicenow",
    name: "ServiceNow",
    registryEntryId: "servicenow",
    authMethods: ["api_key"],
    readinessAny: [
      ["SERVICENOW_INSTANCE_URL", "SERVICENOW_ACCESS_TOKEN"],
      ["SERVICENOW_INSTANCE", "SERVICENOW_ACCESS_TOKEN"],
      ["SERVICENOW_INSTANCE_URL", "SERVICENOW_USERNAME", "SERVICENOW_PASSWORD"],
      ["SERVICENOW_INSTANCE", "SERVICENOW_USERNAME", "SERVICENOW_PASSWORD"],
    ],
    healthTool: "servicenow.health",
    links: {
      dashboard: "https://www.servicenow.com",
      api_keys_docs: "https://www.servicenow.com/docs/bundle/washingtondc-platform-security/page/integrate/authentication/task/t_CreateAnOAuthApiEndpointForExternalClients.html",
    },
    tier1: true,
  },
  outreach: {
    id: "outreach",
    name: "Outreach",
    registryEntryId: "outreach",
    authMethods: ["oauth"],
    oauthProvider: "outreach",
    readinessAny: [["OUTREACH_ACCESS_TOKEN"]],
    readinessByAuth: {
      oauth: [["OUTREACH_ACCESS_TOKEN", "OUTREACH_REFRESH_TOKEN"]],
    },
    healthTool: "outreach.health",
    links: {
      dashboard: "https://app.outreach.io",
      oauth_docs: "https://developers.outreach.io/api/oauth/",
    },
    tier1: true,
  },
  docusign: {
    id: "docusign",
    name: "DocuSign",
    registryEntryId: "docusign",
    authMethods: ["api_key", "oauth"],
    oauthProvider: "docusign",
    readinessAny: [
      ["DOCUSIGN_ACCOUNT_ID", "DOCUSIGN_ACCESS_TOKEN"],
      ["DOCUSIGN_ACCOUNT_ID", "DOCUSIGN_INTEGRATION_KEY", "DOCUSIGN_SECRET_KEY"],
    ],
    readinessByAuth: {
      api_key: [["DOCUSIGN_ACCOUNT_ID", "DOCUSIGN_INTEGRATION_KEY", "DOCUSIGN_SECRET_KEY"]],
      oauth: [["DOCUSIGN_ACCOUNT_ID", "DOCUSIGN_ACCESS_TOKEN", "DOCUSIGN_REFRESH_TOKEN"]],
    },
    healthTool: "docusign.health",
    links: {
      dashboard: "https://admindemo.docusign.com",
      api_keys_docs: "https://developers.docusign.com/platform/auth/",
      oauth_docs: "https://developers.docusign.com/platform/auth/authcode/",
    },
    tier1: true,
  },
  linear: {
    id: "linear",
    name: "Linear",
    registryEntryId: "linear",
    authMethods: ["api_key"],
    readinessAny: [["LINEAR_API_KEY"]],
    readinessByAuth: {
      api_key: [["LINEAR_API_KEY"]],
    },
    healthTool: "linear.health",
    links: {
      dashboard: "https://linear.app/settings/api",
      create_api_key: "https://linear.app/settings/api",
      api_keys_docs: "https://developers.linear.app/docs/graphql/working-with-the-graphql-api",
    },
    tier1: true,
  },
  asana: {
    id: "asana",
    name: "Asana",
    registryEntryId: "asana",
    authMethods: ["api_key"],
    readinessAny: [["ASANA_ACCESS_TOKEN"]],
    healthTool: "asana.health",
    links: {
      dashboard: "https://app.asana.com/0/my-apps",
      api_keys_docs: "https://developers.asana.com/docs/personal-access-token",
    },
  },
  okta: {
    id: "okta",
    name: "Okta",
    registryEntryId: "okta",
    authMethods: ["api_key"],
    readinessAny: [["OKTA_BASE_URL", "OKTA_API_TOKEN"]],
    healthTool: "okta.health",
    links: {
      dashboard: "https://admin.okta.com",
      api_keys_docs: "https://developer.okta.com/docs/guides/create-an-api-token/main/",
    },
  },
  resend: {
    id: "resend",
    name: "Resend",
    registryEntryId: "resend",
    authMethods: ["api_key"],
    readinessAny: [["RESEND_API_KEY"]],
    readinessByAuth: {
      api_key: [["RESEND_API_KEY"]],
    },
    healthTool: "resend.health",
    links: {
      dashboard: "https://resend.com/dashboard",
      create_api_key: "https://resend.com/api-keys",
      api_keys_docs: "https://resend.com/docs/dashboard/api-keys/introduction",
      webhooks_docs: "https://resend.com/docs/dashboard/webhooks/introduction",
    },
    supportsInbound: true,
    tier1: true,
  },
  "google-calendar": {
    id: "google-calendar",
    name: "Google Calendar",
    registryEntryId: "google-calendar",
    authMethods: ["oauth"],
    oauthProvider: "google-calendar",
    readinessAny: [["GOOGLE_ACCESS_TOKEN"]],
    readinessByAuth: {
      oauth: [["GOOGLE_ACCESS_TOKEN", "GOOGLE_REFRESH_TOKEN"]],
    },
    healthTool: "google-calendar.health",
    links: {
      dashboard: "https://console.cloud.google.com/apis/credentials",
      oauth_docs: "https://developers.google.com/calendar/api/guides/auth",
    },
    tier1: true,
  },
  "google-drive": {
    id: "google-drive",
    name: "Google Drive",
    registryEntryId: "google-drive",
    authMethods: ["oauth"],
    oauthProvider: "google-drive",
    readinessAny: [["GOOGLE_ACCESS_TOKEN"]],
    readinessByAuth: {
      oauth: [["GOOGLE_ACCESS_TOKEN", "GOOGLE_REFRESH_TOKEN"]],
    },
    healthTool: "google-drive.health",
    links: {
      dashboard: "https://console.cloud.google.com/apis/credentials",
      oauth_docs: "https://developers.google.com/drive/api/guides/api-specific-auth",
    },
    tier1: true,
  },
  gmail: {
    id: "gmail",
    name: "Gmail",
    registryEntryId: "gmail",
    authMethods: ["oauth"],
    oauthProvider: "gmail",
    readinessAny: [["GOOGLE_ACCESS_TOKEN"]],
    readinessByAuth: {
      oauth: [["GOOGLE_ACCESS_TOKEN", "GOOGLE_REFRESH_TOKEN"]],
    },
    healthTool: "gmail.health",
    links: {
      dashboard: "https://console.cloud.google.com/apis/credentials",
      oauth_docs: "https://developers.google.com/gmail/api/auth/about-auth",
    },
    tier1: true,
  },
  slack: {
    id: "slack",
    name: "Slack",
    registryEntryId: "slack",
    authMethods: ["api_key", "oauth"],
    oauthProvider: "slack",
    readinessAny: [["SLACK_BOT_TOKEN"], ["SLACK_ACCESS_TOKEN"]],
    readinessByAuth: {
      api_key: [["SLACK_BOT_TOKEN"], ["SLACK_ACCESS_TOKEN"]],
      oauth: [["SLACK_ACCESS_TOKEN", "SLACK_REFRESH_TOKEN"]],
    },
    healthTool: "slack.health",
    links: {
      dashboard: "https://api.slack.com/apps",
      create_api_key: "https://api.slack.com/apps",
      api_keys_docs: "https://api.slack.com/authentication/token-types",
      oauth_docs: "https://api.slack.com/authentication/oauth-v2",
    },
    tier1: true,
  },
  "google-workspace": {
    id: "google-workspace",
    name: "Google Workspace",
    registryEntryId: "google-workspace",
    authMethods: ["oauth"],
    oauthProvider: "google-workspace",
    // One token covers all Google Workspace services
    readinessAny: [["GOOGLE_ACCESS_TOKEN"]],
    readinessByAuth: {
      oauth: [["GOOGLE_ACCESS_TOKEN", "GOOGLE_REFRESH_TOKEN"]],
    },
    healthTool: "google-workspace.health",
    links: {
      dashboard: "https://console.cloud.google.com/apis/credentials",
      oauth_docs: "https://developers.google.com/workspace/guides/auth-overview",
    },
    tier1: true,
  },
};

export const TIER1_CONNECTOR_IDS: Tier1IntegrationProvider[] = [
  "resend",
  "slack",
  "gmail",
  "google-calendar",
  "google-drive",
  "google-workspace",
  "jira",
  "linear",
  "hubspot",
  "salesforce",
  "zendesk",
  "servicenow",
  "outreach",
  "docusign",
];

export function getConnectorCapability(id: string): ConnectorCapability | undefined {
  const key = String(id || "").trim().toLowerCase() as ConnectorCapabilityId;
  return CAPABILITIES[key];
}

export function listConnectorCapabilities(): ConnectorCapability[] {
  return Object.values(CAPABILITIES);
}

export function listTier1ConnectorCapabilities(): ConnectorCapability[] {
  return TIER1_CONNECTOR_IDS.map((id) => CAPABILITIES[id]);
}

export function getKnownConnectorIds(): string[] {
  return Object.keys(CAPABILITIES);
}

export function detectConnectorCapabilityId(server: Pick<MCPServerConfig, "name" | "args">):
  | ConnectorCapabilityId
  | null {
  const args = server.args || [];
  for (const arg of args) {
    const match = String(arg).match(CONNECTOR_SCRIPT_PATH_REGEX);
    if (!match) continue;
    const connector = match[1].toLowerCase() as ConnectorCapabilityId;
    if (CAPABILITIES[connector]) return connector;
  }

  const lowerName = String(server.name || "").toLowerCase();
  for (const connector of Object.keys(CAPABILITIES) as ConnectorCapabilityId[]) {
    if (lowerName.includes(connector)) {
      return connector;
    }
  }

  return null;
}

function hasEnvValue(env: Record<string, string> | undefined, key: string): boolean {
  return Boolean(env?.[key]?.trim());
}

function evaluateRequirements(
  env: Record<string, string> | undefined,
  requirements: string[][],
): { configured: boolean; missing: string[]; missingFromBestGroup: string[] } {
  if (requirements.length === 0) {
    return { configured: true, missing: [], missingFromBestGroup: [] };
  }

  let bestMissing: string[] = requirements[0].filter((key) => !hasEnvValue(env, key));

  for (const group of requirements) {
    const missing = group.filter((key) => !hasEnvValue(env, key));
    if (missing.length === 0) {
      return { configured: true, missing: [], missingFromBestGroup: [] };
    }
    if (missing.length < bestMissing.length) {
      bestMissing = missing;
    }
  }

  return { configured: false, missing: bestMissing, missingFromBestGroup: bestMissing };
}

export function evaluateConnectorReadiness(params: {
  capability: ConnectorCapability;
  env?: Record<string, string>;
  authMethod?: IntegrationAuthMethod | "auto";
}): {
  configured: boolean;
  selectedAuthMethod: IntegrationAuthMethod;
  missingInputs: string[];
} {
  const { capability, env, authMethod = "auto" } = params;

  const resolveRequirements = (method: IntegrationAuthMethod): string[][] => {
    return capability.readinessByAuth?.[method] || capability.readinessAny;
  };

  if (authMethod !== "auto") {
    const check = evaluateRequirements(env, resolveRequirements(authMethod));
    return {
      configured: check.configured,
      selectedAuthMethod: authMethod,
      missingInputs: check.missing,
    };
  }

  // Auto mode picks the first satisfied method; otherwise method with fewest missing inputs.
  let bestMethod = capability.authMethods[0] || "api_key";
  let bestMissing = Number.POSITIVE_INFINITY;
  let bestMissingInputs: string[] = [];

  for (const method of capability.authMethods) {
    const check = evaluateRequirements(env, resolveRequirements(method));
    if (check.configured) {
      return {
        configured: true,
        selectedAuthMethod: method,
        missingInputs: [],
      };
    }

    if (check.missing.length < bestMissing) {
      bestMissing = check.missing.length;
      bestMethod = method;
      bestMissingInputs = check.missing;
    }
  }

  return {
    configured: false,
    selectedAuthMethod: bestMethod,
    missingInputs: bestMissingInputs,
  };
}

export function isConnectorConfiguredByCapability(
  connectorId: string,
  env: Record<string, string> | undefined,
): boolean {
  const capability = getConnectorCapability(connectorId);
  if (!capability) return true;
  return evaluateConnectorReadiness({ capability, env, authMethod: "auto" }).configured;
}
