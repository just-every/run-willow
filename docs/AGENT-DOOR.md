# Company agent door

Willow uses Base's shared agent door at `/mcp`, with canonical protected-resource
metadata, `/api/rer/agent-policy`, `/agents` and the native person approval and
Pause doors. `/docs/agents` describes the production registry. The runtime is
pinned to Base `114ef7a61f080da053af783c5fbe06f625d692cc` (`rer-v0.2.88`);
the separately pinned, released CLI is `@runeditrun/rer@0.2.88`.

This is a declared initial set: native record inspection, pending joiner plans
and manual hiring work. `agent-surface.json` is the exact effective tool and
conformance declaration. Both it and `createAgentDoor` declare the mandatory
CORE capabilities: tools, policy, pause, audit and idempotency. Current native field, level, opening-team and HR grants
are re-read at each call. An agent receives no interactive native session.
A plan remains pending for native HR decision, and candidate evidence always
identifies the agent as preparer for the real sponsoring interviewer.

Business `owner_id` resolves through the claimed OA owner and a fixed `wl_agent_installation_owner` account and a durable
`wl_agent_people` binding to the native Willow member. Native sessions establish
that binding through ordinary admission. Token email never chooses the account.
The native member, account status and all effective grants are re-read; a local
admin is not a Business policy editor. Business team reconciliation and multiple
sponsors are undeclared. Existing Willow API/OAuth credentials keep their original
scopes and HTTP doors; they are not accepted as MCP company credentials.

New SQL uses additive migrations 0102–0107. Native audited batches include the
original door operation, agent, sponsor and named approvers, and fence the current
native account, grants, policy revision, Pause, agent and consent. Native record
revisions still guard writes. No Undo is invented for these operations. No paid
provider is reached by this registry, so no network-edge module or cost is
registered. The journey uses `spend: {none: true}`.

Owner verification uses the real signed `/auth/owner-claim` lifecycle, followed
by native setup, employer, template publication, employment and opening actions.
Only the disposable conformance tooling supplies fixture data. It has no production
route, credential or database writer. The normal `rer verify` invokes Base's
conformance after Willow's existing checks; the focused local command is
`node node_modules/@runeditrun/rer/cli/agent-door.mjs . deploy.json` after build.

Events, public MCP resources, specialist prompts and subscriptions are undeclared.
They have empty catalogues, no discovery advertisement and typed
`capability_not_declared` refusals; resource links are withheld. Native read tools
still inspect permitted employee, application and proposal records through the
same native visibility readers. Internal resource adapters remain available to
audit, without opening the public resource family. External mail, multi-sponsor
execution and resource refresh remain partial obligations. The subset does not
claim the unscoped optional families or weaken owner, principal, consent,
authorization, approval, policy, Pause or replay checks.

Agent decisions, exact summaries, approvals and replay outcomes retain private
custody. Native erasure remains closed once door evidence exists, including an
atomic deletion fence. There is no claim of subject-scoped agent erasure.
Archives pause the door, revoke retained agents, expire pending approvals and
remove the adopted settings/policy so restore needs fresh binding and owner resume.

## Relation to the proposed ct surface

The proposed surface at `9f10a862d7a264aa21a128b60d7039e439b3ea54` is read-only
input and is not merged. Its target tool table includes capabilities absent from
native main, including connected payroll, benefits, identity reconciliation and
provider execution. None is mocked or claimed. Its SURFACE-001–005 and further
AGENT-006/007/010/013 identifiers are absent from current main; this change does
not invent or import their judgments.

The implemented names preserve `willow.directory.browse`, `willow.people.read`
and `willow.plans.prepare`; native manual hiring splits the proposed
`willow.candidates.manage` into create, move, scorecard, read and list, with
`willow.hiring.status` as a content-free native work witness. `willow.plans.read`
inspects existing proposals. Date-specific reads use the `asOf` argument.
Native record readers cover people, applications and proposals; the public
resource family is undeclared. The declared classes are
standard and sensitive. Broader native jobs in the proposed surface still need
adapters and journeys, and BASE-AGENT-002/003 remain partial for that gap.

No existing test is weakened or removed. The only new test tooling is the
agent-surface journey and its native owner/attribution fixtures.

The 0.2.88 focused production conformance passed 1190 of 1191 points, including
all CORE subset refusals and both supported MCP eras. The remaining failure is
the native browser journey at agents-390-navigation. Normal unsharded verify
stopped earlier at AI-002's concurrent location creation (409 precondition_failed);
the normal records-policy shard passed all six native journeys, then stopped
in Base hydration before the agent phase. These failure exits are retained;
normal verification is not claimed green.

The ct table names 113 tools and 55 resource templates. This CORE declaration
has ten native tools, no public resource templates and no prompts or events.
The exact name overlap is directory.browse, people.read and plans.prepare
(with the willow prefix); the other 110 ct tool names are absent. Its proposed
candidates.manage is represented only by the native candidate tools listed in
agent-surface.json. Additional native names are hiring.status, candidates.list,
candidates.read, candidates.create, candidates.move, candidates.scorecard and
plans.read. All use the willow prefix. Three internal record readers do not
constitute public resource adoption. Only standard and sensitive classes are
implemented. The journey covers each declared pair, pending joiner preparation
and manual hiring; the ct hire/mover/leave/payroll/departure specialist week,
provider read-back and nine other risk classes remain unproved.

SURFACE-001–005 and AGENT-006/007/010/013 are not clauses in current main.
AGENT-001–003 retain their native partial status: multi-provider reconciliation,
cross-person simulation and controlled recovery remain gaps. The ct branch is
not merged and its surface is not rewritten. This adoption changes no native
signing, identity-provider, payroll, AI or access-administration authority.

The changed public agent docs and unauthenticated Agents door were inspected
against the real production Worker's HTTP ingress at 1440 and 390 pixels:
both returned 200 with no horizontal overflow. The sign-in control measured
46.8 pixels high. The private native browser journey remains failed; these
public captures do not replace it or establish the full specialist week.
