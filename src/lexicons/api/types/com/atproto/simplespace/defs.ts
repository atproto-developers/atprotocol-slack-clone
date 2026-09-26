/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from '@atproto/lexicon'
import { CID } from 'multiformats/cid'
import { validate as _validate } from '../../../../lexicons.js'
import {
  type $Typed,
  is$typed as _is$typed,
  type OmitKey,
} from '../../../../util.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'com.atproto.simplespace.defs'

/** User access policy: any user may access the space. */
export interface PublicPolicy {
  $type?: 'com.atproto.simplespace.defs#publicPolicy'
}

const hashPublicPolicy = 'publicPolicy'

export function isPublicPolicy<V>(v: V) {
  return is$typed(v, id, hashPublicPolicy)
}

export function validatePublicPolicy<V>(v: V) {
  return validate<PublicPolicy & V>(v, id, hashPublicPolicy)
}

/** User access policy: only users on the space's member list may access it. */
export interface MemberListPolicy {
  $type?: 'com.atproto.simplespace.defs#memberListPolicy'
}

const hashMemberListPolicy = 'memberListPolicy'

export function isMemberListPolicy<V>(v: V) {
  return is$typed(v, id, hashMemberListPolicy)
}

export function validateMemberListPolicy<V>(v: V) {
  return validate<MemberListPolicy & V>(v, id, hashMemberListPolicy)
}

/** User access policy: the managing app is asked, via checkUserAccess, whether to authorize each user. */
export interface ManagingAppPolicy {
  $type?: 'com.atproto.simplespace.defs#managingAppPolicy'
  /** Service identifier of the managing app: a DID with an optional service fragment (e.g. 'did:web:example.com#forum'). */
  managingApp: string
}

const hashManagingAppPolicy = 'managingAppPolicy'

export function isManagingAppPolicy<V>(v: V) {
  return is$typed(v, id, hashManagingAppPolicy)
}

export function validateManagingAppPolicy<V>(v: V) {
  return validate<ManagingAppPolicy & V>(v, id, hashManagingAppPolicy)
}

/** App access policy: any app may access the space. No client attestation required. */
export interface Open {
  $type?: 'com.atproto.simplespace.defs#open'
}

const hashOpen = 'open'

export function isOpen<V>(v: V) {
  return is$typed(v, id, hashOpen)
}

export function validateOpen<V>(v: V) {
  return validate<Open & V>(v, id, hashOpen)
}

/** App access policy: only the named clients may access the space, evaluated against the attested client_id. */
export interface AllowList {
  $type?: 'com.atproto.simplespace.defs#allowList'
  /** The OAuth client IDs permitted to access the space. */
  allowed: string[]
}

const hashAllowList = 'allowList'

export function isAllowList<V>(v: V) {
  return is$typed(v, id, hashAllowList)
}

export function validateAllowList<V>(v: V) {
  return validate<AllowList & V>(v, id, hashAllowList)
}
