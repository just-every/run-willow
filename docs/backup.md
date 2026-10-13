One command writes everything Willow holds into a single archive, and one command restores it into a fresh checkout. Run them from the Willow folder with Willow stopped (`rer dev --stop`).

## Export

```sh
rer export --output exports/willow.rer
```

The archive holds every Willow table (the employer, places, schedules, members and permissions, people and their private details, employment, terms and pay, leave policies, accounts, the ledger and requests, templates and cases, documents and acknowledgements, payroll batches, proposals and the audit trail), the move-in journal with its original files, and every stored document. It comes with an integrity receipt.

The archive holds private employee data. Keep it where only you can read it, never inside `public/`; export refuses that destination and a build refuses to ship an archive.

## Restore

Restore into an empty checkout: a fresh clone, or one you have reset.

```sh
rer import --input exports/willow.rer --yes
rer setup
```

Import checks the archive and restores it all at once into the empty destination. Sign-in sessions and credentials never travel in an archive, so run `rer setup` afterwards for the owner. Active members ask for a new email link on the normal sign-in page; their records and permissions are already there. Ended members stay ended.

## Reset

```sh
rer reset --yes
```

Reset removes this checkout's local data, owner and settings. It is destructive: export first if you want the data back. Reset keeps your export archives.

## Move to your own Cloudflare account

`rer deploy --dry-run` checks and builds the deployment without contacting any provider. A real `rer deploy` puts Willow on your own Cloudflare account and needs a verified mail sender for sign-in links.
