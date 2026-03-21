export class PolicyservApi {
    public constructor(private readonly baseUrl: string, private readonly apiKey: string) {
    }

    public async createCommunity(communityName: string): Promise<string> {
        const community = await this.doRequest<CommunityResponse>("POST", "/api/v1/communities/new", {
            name: communityName,
        });
        return community.community_id;
    }

    public async getCommunity(communityId: string): Promise<CommunityResponse | null> {
        try {
            return await this.doRequest<CommunityResponse>("GET", `/api/v1/communities/${encodeURIComponent(communityId)}`);
        } catch (e) {
            if (e.status === 404) {
                return null;
            }
            throw e;
        }
    }

    public async getInstanceCommunityConfig(): Promise<CommunityConfig> {
        return await this.doRequest<CommunityConfig>("GET", "/api/v1/instance/community_config");
    }

    public async setCommunityConfig(communityId: string, config: CommunityConfig): Promise<void> {
        await this.doRequest<void>("POST", `/api/v1/communities/${encodeURIComponent(communityId)}/config`, config);
    }

    public async getRoom(roomId: string): Promise<RoomResponse | null> {
        try {
            return await this.doRequest<RoomResponse>("GET", `/api/v1/rooms/${encodeURIComponent(roomId)}`);
        } catch (e) {
            if (e.status === 404) {
                return null;
            }
            throw e;
        }
    }

    public async addRoom(roomId: string, communityId: string): Promise<void> {
        await this.doRequest<void>("POST", `/api/v1/rooms/${encodeURIComponent(roomId)}/join`, {
            community_id: communityId,
        });
    }

    private async doRequest<T>(method: string, path: string, body?: any): Promise<T> {
        const req = await fetch(this.baseUrl + path, {
            method: method,
            headers: {
                "Authorization": `Bearer ${this.apiKey}`
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        if (req.status !== 200) {
            const body = await req.text();
            throw new HttpError(`Request (${path}) failed with status ${req.status}: ${body}`, req.status);
        }
        return await req.json();
    }
}

interface CommunityResponse {
    community_id: string;
    name: string;
    config: CommunityConfig;
}

export interface CommunityConfig {
    keyword_filter_keywords?: string[];
    keyword_filter_use_full_event?: boolean;
    keyword_template_filter_template_names?: string[];
    keyword_template_filter_use_full_event?: boolean;
    mention_filter_max_mentions?: number; // whole number, positive to enable
    mention_filter_min_plaintext_length?: number; // whole number
    many_ats_filter_max_ats?: number; // whole number, positive to enable
    media_filter_media_types?: string[];
    untrusted_media_filter_media_types?: string[];
    untrusted_media_filter_use_muninn?: boolean;
    untrusted_media_filter_use_power_levels?: boolean;
    untrusted_media_filter_allowed_user_globs?: string[];
    untrusted_media_filter_denied_user_globs?: string[];
    density_filter_max_density?: number; // float, positive to enable
    density_filter_min_trigger_length?: number; // whole number, positive to enable
    trim_length_filter_max_difference?: number; // float, positive to enable
    length_filter_max_length?: number; // whole number, positive to enable
    sender_prefilter_allowed_senders?: string[];
    event_type_prefilter_allowed_event_types?: string[];
    event_type_prefilter_allowed_state_event_types?: string[];
    hellban_postfilter_minutes?: number; // whole number, positive to enable
    mjolnir_filter_enabled?: boolean;
    spam_threshold?: number; // float
    webhook_url?: string;
    openai_filter_fail_secure?: boolean;
    sticky_events_filter_allow_sticky_events?: boolean;
    hma_filter_enabled_banks?: string[];
    link_filter_allowed_url_globs?: string[];
    link_filter_denied_url_globs?: string[];
    forbidden_user_id_filter_patterns?: string[];
    forbidden_user_id_filter_event_types?: string[];
    forbidden_user_id_filter_allowed_users?: string[];
    frequency_filter_event_types?: string[];
    frequency_filter_rate_limit?: number; // float, positive to enable
    mention_frequency_filter_rate_limit?: number; // float, positive to enable
    mention_frequency_filter_min_plaintext_length?: number; // whole number
    unsafe_signing_key_filter_enabled?: boolean;
    local_ai_scanner_configs?: LocalAIScannerConfigEntry[];
}

export interface LocalAIScannerConfigEntry {
    type: string;
    threshold: number;
}

export interface ConfigDescription {
    property: keyof CommunityConfig;
    description: string;
    transformFn?: (val: string) => CommunityConfig[keyof CommunityConfig];
}

export function toArray(val: string): string[] {
    return val.split(",").map(s => s.trim());
}

function toPatternArray(val: string): string[] {
    // Split on commas, but not commas inside /regex/ delimiters.
    // This allows patterns like: @*:evil.example,/@.{50,}:.*/
    const patterns: string[] = [];
    let current = "";
    let insideRegex = false;

    for (let i = 0; i < val.length; i++) {
        const ch = val[i];
        if (ch === "/" && !insideRegex && current.trim().length === 0) {
            insideRegex = true;
            current += ch;
        } else if (ch === "/" && insideRegex) {
            insideRegex = false;
            current += ch;
        } else if (ch === "," && !insideRegex) {
            const trimmed = current.trim();
            if (trimmed.length > 0) {
                patterns.push(trimmed);
            }
            current = "";
        } else {
            current += ch;
        }
    }
    const trimmed = current.trim();
    if (trimmed.length > 0) {
        patterns.push(trimmed);
    }
    return patterns;
}

function toNumber(val: string): number {
    const n = Number(val);
    if (isNaN(n)) {
        throw new Error(`Invalid number: ${val}`);
    }
    return n;
}

function toBoolean(val: string): boolean {
    val = val.toLowerCase();
    if (val === "true" || val === "t" || val === "yes" || val === "y") {
        return true;
    } else if (val === "false" || val === "f" || val === "no" || val === "n") {
        return false;
    } else {
        throw new Error(`Invalid boolean: ${val}`);
    }
}

// Parses "type:threshold,type:threshold" into LocalAIScannerConfigEntry[]
// e.g. "nsfw:0.65,violence:0.80" -> [{type:"nsfw",threshold:0.65},{type:"violence",threshold:0.80}]
// Use "none" or empty string to disable all scanners.
function toScannerConfigs(val: string): LocalAIScannerConfigEntry[] {
    val = val.trim();
    if (val === "" || val.toLowerCase() === "none") {
        return [];
    }
    return val.split(",").map(entry => {
        const parts = entry.trim().split(":");
        if (parts.length !== 2) {
            throw new Error(`Invalid scanner config entry "${entry.trim()}". Expected format: type:threshold (e.g. nsfw:0.65)`);
        }
        const type = parts[0].trim();
        const threshold = Number(parts[1].trim());
        if (!type) {
            throw new Error(`Empty scanner type in "${entry.trim()}"`);
        }
        if (isNaN(threshold) || threshold <= 0 || threshold > 1) {
            throw new Error(`Invalid threshold "${parts[1].trim()}" for scanner type "${type}". Must be between 0 and 1.`);
        }
        return { type, threshold };
    });
}

export const ConfigDescriptions: Record<string /* user-friendly name */, ConfigDescription /* actual name and some info */> = {
    "keywords": {
        property: "keyword_filter_keywords",
        description: "The keywords to cause an event to be marked as spam for. The search will be on the message's content regardless of type. Multiple keywords can be specified by separating them with commas.",
        transformFn: toArray,
    },
    "keywords_check_full_event": {
        property: "keyword_filter_use_full_event",
        description: "When true, check keywords against the full event rather than just its content. Avoid using keywords like `room_id` and `sender` in this mode.",
        transformFn: toBoolean,
    },
    // Note: Keyword templates are disabled because we don't (yet) have a good way to expose which ones exist, and which ones a community can use.
    // "keyword_templates": {
    //     property: "keyword_template_filter_template_names",
    //     description: "The keyword templates to check event contents against. Multiple templates can be specified by separating them with commas.",
    //     transformFn: toArray,
    // },
    // "keyword_templates_check_full_event": {
    //     property: "keyword_template_filter_use_full_event",
    //     description: "When true, check keyword templates against the full event rather than just its content. Avoid using templates like `room_id` and `sender` in this mode.",
    //     transformFn: toBoolean,
    // },
    "max_mentions": {
        property: "mention_filter_max_mentions",
        description: "The maximum number of mentions allowed in a single message. Set to -1 to disable.",
        transformFn: toNumber,
    },
    "min_plaintext_mention_length": {
        property: "mention_filter_min_plaintext_length",
        description: "The minimum length a user's display name must be to be considered a mention.",
        transformFn: toNumber,
    },
    "max_ats": {
        property: "many_ats_filter_max_ats",
        description: "The maximum number of '@' symbols allowed in a single message. Set to -1 to disable.",
        transformFn: toNumber,
    },
    "max_mentions_frequency": {
        property: "mention_frequency_filter_rate_limit",
        description: "The maximum number of mentions a user can send per second. 0.25 is approximately 15 mentions per minute. Set to -1 to disable this filter.",
        transformFn: toNumber,
    },
    "min_plaintext_mention_length_frequency": {
        property: "mention_frequency_filter_min_plaintext_length",
        description: "The same as `min_plaintext_mention_length`, but for the `max_mentions_frequency` filter. Should be kept in sync with `min_plaintext_mention_length`.",
        transformFn: toNumber,
    },
    "max_message_frequency": {
        property: "frequency_filter_rate_limit",
        description: "The maximum number of messages a user can send per second. 0.25 is approximately 15 messages per minute. Set to -1 to disable this filter.",
        transformFn: toNumber,
    },
    "message_frequency_event_types": {
        property: "frequency_filter_event_types",
        description: "The event types to check for the `max_message_frequency` filter. Multiple types can be specified by separating them with commas. Set to an empty value to disable this filter.",
        transformFn: toArray,
    },
    "media_types": {
        property: "media_filter_media_types",
        description: "The event and message types to consider spam. Multiple types can be specified by separating them with commas.",
        transformFn: toArray,
    },
    "untrusted_media_types": {
        property: "untrusted_media_filter_media_types",
        description: "The event and message types to consider spam if the sender is not trusted. Multiple types can be specified by separating them with commas. Trust uses a deny-wins model, where the first trust source to deny a user will cause them to be untrusted. If no trust sources deny the user, then the first to allow them will cause them to be trusted. This filter assumes no trust by default (and therefore denies after all trust sources are consulted).",
        transformFn: toArray,
    },
    "enable_muninn_hall_trust_source": {
        property: "untrusted_media_filter_use_muninn",
        description: "Trusts users from servers which are members of Muninn Hall.",
        transformFn: toBoolean,
    },
    "enable_power_levels_trust_source": {
        property: "untrusted_media_filter_use_power_levels",
        description: "Trusts users if they have above-default power levels in the room.",
        transformFn: toBoolean,
    },
    "allowed_globs_trust_source": {
        property: "untrusted_media_filter_allowed_user_globs",
        description: "The globs of users trusted to send media. Multiple globs can be specified by separating them with commas.",
        transformFn: toArray,
    },
    "denied_globs_trust_source": {
        property: "untrusted_media_filter_denied_user_globs",
        description: "The globs of users to explicitly not trust sending media. Multiple globs can be specified by separating them with commas. Overrides any source which trusts a user.",
        transformFn: toArray,
    },
    "max_density": {
        property: "density_filter_max_density",
        description: "The maximum ratio of non-whitespace to whitespace characters allowed in a message. Set to -1 to disable.",
        transformFn: toNumber,
    },
    "min_length_for_density": {
        property: "density_filter_min_trigger_length",
        description: "The minimum length a message must be before the max_density value applies.",
        transformFn: toNumber,
    },
    "max_trim_difference": {
        property: "trim_length_filter_max_difference",
        description: "The maximum difference in length between the message and its trimmed version. Set to -1 to disable.",
        transformFn: toNumber,
    },
    "max_length": {
        property: "length_filter_max_length",
        description: "The maximum length an event can be when serialized in its federation (PDU) format. Set to -1 to disable.",
        transformFn: toNumber,
    },
    "allowed_senders": {
        property: "sender_prefilter_allowed_senders",
        description: "The users to always allow to send events. Multiple users can be specified by separating them with commas.",
        transformFn: toArray,
    },
    "allowed_event_types": {
        property: "event_type_prefilter_allowed_event_types",
        description: "The event types to always allow in a room (when the sender has appropriate power level to send them). Multiple types can be specified by separating them with commas.",
        transformFn: toArray,
    },
    "allowed_state_event_types": {
        property: "event_type_prefilter_allowed_state_event_types",
        description: "The state event types to always allow in a room (when the sender has appropriate power level to send them). Multiple types can be specified by separating them with commas.",
        transformFn: toArray,
    },
    "user_timeout_minutes": {
        property: "hellban_postfilter_minutes",
        description: "After a user is flagged for sending spam, consider all of their events as spam for this long. Sending more events does not extend this ban. Set to -1 to disable.",
        transformFn: toNumber,
    },
    "enforce_foundation_code_of_conduct": {
        property: "mjolnir_filter_enabled",
        description: "Whether to use the Matrix.org Foundation's code of conduct ban list to consider senders as spam. In future it may be possible to use a custom policy room/list.",
        transformFn: toBoolean,
    },
    // Note: we don't currently allow users to set this particular config option because internally policyserv only ever resolves to a 0.0 or 1.0 currently.
    // "spam_threshold": {
    //     property: "spam_threshold",
    //     description: "How 'spammy' an event must be to be considered spam. Zero is not spammy, one is very spammy.",
    //     transformFn: toNumber,
    // },
    // Note: we don't currently allow this to be set because we don't have a good way to indicate whether the URL domain is allowed.
    // "webhook_url": {
    //     property: "webhook_url",
    //     description: "The (preferably Hookshot) URL to send notifications of spammy events to. If not set, no notifications will be sent.",
    // },
    "fail_secure_for_openai": {
        property: "openai_filter_fail_secure",
        description: "If the OpenAI filter is enabled for your community or room, this determines whether it considers an event spam when the filter cannot reach OpenAI. Set to false to allow events to pass during errors.",
        transformFn: toBoolean,
    },
    "allow_sticky_events": {
        property: "sticky_events_filter_allow_sticky_events",
        description: "Whether to enable the use of MSC4354-style Sticky Events in rooms.",
        transformFn: toBoolean,
    },
    // Note: we don't currently allow this to be changed because we want to ensure that illegal content is always blocked. We'll need to find a way to make this additive rather than replace the instance's values.
    // "enabled_hma_banks": {
    //     property: "hma_filter_enabled_banks",
    //     description: "If the HMA filter is enabled for your community, these are the bank names to scan media against. Multiple banks can be specified by separating them with commas.",
    //     transformFn: toArray,
    // },
    "allowed_link_globs": {
        property: "link_filter_allowed_url_globs",
        description: "The globs of URLs to allow in messages. Multiple globs can be specified by separating them with commas. Example: `https://github.com/*,https://spec.matrix.org/v1.17/*`",
        transformFn: toArray,
    },
    "denied_link_globs": {
        property: "link_filter_denied_url_globs",
        description: "The globs of URLs to explicitly not allow in messages. Multiple globs can be specified by separating them with commas. Overrides the allow list of URLs. Example: `*example.org*`",
        transformFn: toArray,
    },
    "forbidden_user_patterns": {
        property: "forbidden_user_id_filter_patterns",
        description: "Glob or regex patterns for user IDs to block. Globs use * as wildcard. Wrap regex in /slashes/. Multiple patterns can be specified by separating them with commas (commas inside /regex/ are safe). Example: `@*:evil.example,/@.{50,}:.*/`",
        transformFn: toPatternArray,
    },
    "forbidden_user_event_types": {
        property: "forbidden_user_id_filter_event_types",
        description: "Which event types to block from forbidden users. Use * for all events, or list specific types separated by commas. Defaults to all if not set. Example: `*` or `m.room.member,m.room.message,m.reaction`",
        transformFn: toArray,
    },
    "forbidden_user_allowed_users": {
        property: "forbidden_user_id_filter_allowed_users",
        description: "User IDs to exempt from the forbidden user patterns (whitelist overrides). Multiple users can be specified by separating them with commas.",
        transformFn: toArray,
    },
    "deny_unsafe_signing_keys": {
        property: "unsafe_signing_key_filter_enabled",
        description: "If true, events sent by servers with known-unsafe signing keys will be flagged as spam. Set to false to disable.",
        transformFn: toBoolean,
    },
    "ai_scanners": {
        property: "local_ai_scanner_configs",
        description: "Configure local AI image scanners for this community. Format: `type:threshold` pairs separated by commas. Available types depend on instance configuration (e.g. nsfw, violence). Example: `nsfw:0.65` or `nsfw:0.65,violence:0.80`. Set to `none` to disable all scanners.",
        transformFn: toScannerConfigs,
    },
};

interface RoomResponse {
    room_id: string;
    room_version: string;
    community_id: string;

    // the other fields are not relevant to us
}

class HttpError extends Error {
    constructor(message: string, public readonly status: number) {
        super(message);
    }
}