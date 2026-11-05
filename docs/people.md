Everyone at your employer has one record in **People**: who they are, their employment periods and every change of terms, their leave, their documents and their joiner, mover and leaver cases. HR (the **Manage people, employment and lifecycle** permission) does the work on this page.

## Start a joiner

At the foot of **People**, **Start a joiner** asks for the joiner template, the person's legal and preferred names, work email, employee number, start date, employment type, payroll identifier (the employee's identifier in your payroll provider, if known), job title, department, location, manager, working schedule. Pay fields appear only when you also have **Read compensation** access; otherwise an authorized colleague can record pay separately. Press **Start joiner**.

Willow creates the person, their first employment period and a joiner case. Each task in the template goes to the person who does it, due relative to the start date:

| Task | Who | Due |
| --- | --- | --- |
| Laptop ready | IT | 2 days before the start |
| Welcome lunch | Manager | On the start date |
| Contract filed | HR | 7 days after the start |

Everyone sees their tasks on **Home**. A task marked as needing evidence is done only with a note of what was done, and Willow never acts on an outside system itself. A case completes only when every task is done and the information the template requires is on the record.

## Keep the record

Links for tools are inside **For agents and integrations**. They return JSON rather than a person-facing page, and include only what your current access allows.

A person's page shows **Directory** (name, work email, role, department, location, manager, status), **Private details** (personal email, phone, home address, date of birth, emergency contact) and **Employment**. Edit them from the **Edit** rows on each card; a person can keep their own private details up to date.

A preferred first name keeps the rest of the legal name in directory displays: Olivia Bennett with the preferred name Liv appears as **Liv Bennett**. A preferred name that already contains several words displays as entered. The legal name stays on the record.

**Documents** keeps private files by category. Each upload is a new version, and the category decides who can read it. When a category asks for it, the person presses **I received this document** to acknowledge receipt.

## Schedule a change

**Schedule a change (mover)** under **Employment** records a promotion, a new manager, new hours or new pay from an **Effective from** date, with its reason and, if you like, a mover case. The change takes effect on its date. Past, current and scheduled versions all stay in the employment table, marked **past**, **in force** or **scheduled**; a scheduled version can be canceled before it starts.

## Record a leaver

**Record a leaver** asks for the last day of employment, a private reason and the leaver template. The leaver's tasks go out like a joiner's, including any **End this person's Willow access** task. The employment period ends on that day and its history stays.

If approved leave extends beyond that period's last day, the person's **Leave** card flags **Approved leave needs HR review** for readers who can see the requests and employment end date. Open the flagged request and cancel it or correct its dates. Recording a leaver leaves the approved request and ledger intact; cancellation or correction adds the normal reversing entries and keeps the history. An earlier period's unresolved leave remains flagged after rehire.

## Rehire

When someone comes back, **Rehire** on their page starts a new employment period with a new joiner case. Earlier periods stay as they were, and Willow access is not restored automatically.

## Resolve a refused change

A duplicate work email or employee number keeps the joiner form and its entered values on **People**, and names the existing person. An overlapping rehire stays on the person's **Rehire** form. No partial person, period or case is created.

When changing an amount in **Schedule a change (mover)**, **Pay basis: Unchanged** retains the basis in force on the effective date. A refused pay change keeps the date, amount and other entries visible. **Schedule a pay change** on the Compensation card is the pay-only door. It can correct starting pay on the employment start date before any starting or terms change has been handed off, retaining the old version as canceled; changing pay requires an access level with **Read compensation** and the relevant compensation editing right. HR without that access asks the owner to assign it or record the pay before payroll handoff. Your own Compensation card explains when your access level withholds its values.

An agent proposal containing pay needs an approver with **People management** and **Read compensation**. HR without that access can read the redacted proposal and decline it; the page explains who can approve before offering approval.

Open manager tasks on an open joiner case follow the manager currently in force. A future manager change moves the work when it takes effect. Completed tasks retain their recorded assignment and evidence. The owner can take over a manager task when necessary; employee tasks remain with the employee. An assigned IT member can complete a leaver's **End this person's Willow access** task; it ends only that person's access and completes the task together.

Leave balances include only posted accrual. HR signs off the proposed opening balance on the person’s **Leave** card, then uses **Post accrual** through the required date. Until sign-off, the employee sees why requests are unavailable; a zero balance does not imply accrual has already been posted.
