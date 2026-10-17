Willow does not run payroll. Each pay period it gathers every change your payroll provider needs to know about and hands it over exactly once; the provider calculates pay, tax and payments. This page needs **Prepare and hand off payroll changes** and **Read compensation**.

## Choose the file layout

The owner chooses the layout once, on **Payroll** under **Owner layout mapping**:

- **Generic change CSV**: map each Willow field to the column heading and order your provider expects.
- **ADP RUN Time Sheet Import**: enter the company code, pay frequency, rate code and an earnings code for each leave policy, from your ADP reports. This layout carries hours; starts, ends, changes of terms and reversals need the generic layout.

## Prepare a batch

Under **New change batch**, enter the pay period start and end and press **Prepare draft**. The draft gathers every change effective by the period end that has not been handed off yet:

| Change | What it carries |
| --- | --- |
| start | a new employment period, with its role, pay and schedule |
| change | a new version of terms, with each field's old and new value |
| leave | approved leave in hours |
| leave reversal | canceled or corrected leave |
| end | the last day of employment |

**Exceptions** lists anything a change cannot go without, such as a missing payroll identifier, with a link to fix it on the person's page.

## Preview and export

**Preview export file** writes the actual file your provider will receive. Read it, then press **Export this batch**. Export freezes those exact bytes: **Download CSV** always returns the same file, and each change is handed off only once. If the mapping changed after the preview, Willow asks for another preview; if a record behind the batch changed, discard the draft and prepare a fresh one.

When your provider confirms the import, **Record provider acknowledgement** keeps their reference with the batch.
