Willow runs on your own computer with one command, and the same checkout can later go to your own Cloudflare account. It is free and open source under the MIT license, and it needs no provider account to start.

## Get Willow and start it

Willow uses rer, the Run Edit Run command, to install, start, back up and deploy it. Willow runs on macOS, Linux or Windows with WSL2. Git is required; rer brings Node and pnpm. It uses the exact versions the checkout pins. One line installs rer, clones Willow into `run-willow` and starts it:

```sh
curl -fsSL https://runeditrun.com/install.sh | sh -s -- dev just-every/run-willow
```

Already have Node 22 or later? `npx -y @runeditrun/rer dev just-every/run-willow` does the same.

Before using bare `rer` in this or a new terminal, add the installed launcher to this terminal’s PATH:

```sh
export PATH="$HOME/.local/bin:$PATH"
```

Alternatively, use `$HOME/.local/bin/rer` wherever these guides say `rer`. To start Willow again later, run `cd run-willow && rer dev` from the folder where you installed it.

The first start installs everything and can take a few minutes. When Willow is ready, `rer dev` prints `RER_READY` with the local address and `RER_OPEN`, a link that opens Willow signed in as the owner. Open that link on the same computer and keep it to yourself: it carries this checkout's private key.

To set up the real owner mailbox instead of the local test owner, install without starting Willow, then answer the setup prompt:

```sh
curl -fsSL https://runeditrun.com/install.sh | sh -s -- install just-every/run-willow
export PATH="$HOME/.local/bin:$PATH"
cd run-willow
rer setup
rer dev
```

Willow sends no email while it runs locally. Captured mail and the local outbox have been retired. Use the owner’s `RER_OPEN` link or `rer dev --as hr` for the supplied HR persona (or use `payroll`, `it`, `manager` or `employee`). For an invited or active local member outside those personas, use `rer dev --as member@example.com` with that member’s actual mailbox and open its private `RER_OPEN` link. It sends no sign-in email. Connections records notice delivery attempts; it does not show message bodies or delivered links. To inspect actual email delivery or notice content, use a hosted installation with configured outbound mail.

## Finish setup

1. Open the `RER_OPEN` link. Willow shows **Finish setup** with the owner's name and email.
2. Check **I confirm this owner account is ready to use.** and press **Finish setup**.
3. Willow asks for **Your employer**: its name, time zone, country and currency. Press **Save**.

| Step | Where |
| --- | --- |
| Get Willow and start it | Your terminal, in the folder you choose |
| Finish setup | Your browser, at `/setup` |
| Your employer | Your browser, the first page of the app |

Your installation's own front page shows a **Sign in** button once setup is finished. On a hosted installation with outbound mail configured, members sign in with an emailed link; there are no passwords to keep. Locally, use the private `RER_OPEN` link described above.

## Stop and start again

Stop Willow with `rer dev --stop` (or Ctrl-C) and start it again with `rer dev`. Your records stay in the checkout's local data until you choose to reset them. Next, [set Willow up for your team](/docs/first-day).
