Willow runs on your own computer with one command, and the same checkout can later go to your own Cloudflare account. It is free and open source under the MIT licence, and it needs no provider account to start.

## Get Willow and start it

Willow uses rer, the Run Edit Run command, to install, start, back up and deploy it. Willow runs on macOS, Linux or Windows with WSL2; rer brings Node and pnpm and picks the exact versions the checkout pins. One line installs rer, clones Willow and starts it:

```sh
npx -y @runeditrun/rer dev just-every/run-willow
```

Without Node, `curl -fsSL https://runeditrun.com/install.sh | sh -s -- dev just-every/run-willow` does the same. To start it again later, run `cd run-willow && rer dev`.

The first start installs everything and can take a few minutes. When Willow is ready, `rer dev` prints `RER_READY` with the local address and `RER_OPEN`, a link that opens Willow signed in as the owner. Open that link on the same computer and keep it to yourself: it carries this checkout's private key.

To set up the real owner mailbox instead of the local test owner, run `npx -y @runeditrun/rer install just-every/run-willow`, then `rer setup` from the checkout before `rer dev`, and answer its prompt. Willow sends no email while it runs locally: sign-in messages wait in a local outbox on your computer.

## Finish setup

1. Open the `RER_OPEN` link. Willow shows **Finish setup** with the owner's name and email.
2. Tick **I confirm this owner account is ready to use.** and press **Finish setup**.
3. Willow asks for **Your employer**: its name, time zone, country and currency. Press **Save**.

| Step | Where |
| --- | --- |
| Get Willow and start it | Your terminal, in the folder you choose |
| Finish setup | Your browser, at `/setup` |
| Your employer | Your browser, the first page of the app |

Your installation's own front page shows a **Sign in** button once setup is finished. Everyone signs in with an emailed link; there are no passwords to keep.

## Stop and start again

Stop Willow with `rer dev --stop` (or Ctrl-C) and start it again with `rer dev`. Your records stay in the checkout's local data until you choose to reset them. Next, [set Willow up for your team](/docs/first-day).
