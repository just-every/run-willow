export { approveCredential, issueCredential, rotateCredential, revokeCredential, listCredentials, credentialMetadata } from './store'
export type { CredentialMetadata } from './store'
export { credentialActor, credentialDoor, assertCredentialCurrent, CREDENTIAL_API_DOORS } from './authenticate'
export { isCredentialActor, credentialPeople, credentialPersonAllowed, credentialContext } from './principal'
