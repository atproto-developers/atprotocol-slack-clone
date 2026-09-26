/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type HeadersMap, XRPCError } from '@atproto/xrpc'
import { type ValidationResult, BlobRef } from '@atproto/lexicon'
import { CID } from 'multiformats/cid'
import { validate as _validate } from '../../../../lexicons.js'
import {
  type $Typed,
  is$typed as _is$typed,
  type OmitKey,
} from '../../../../util.js'
import type * as ComAtprotoSimplespaceDefs from './defs.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'com.atproto.simplespace.updateSpace'

export type QueryParams = {}

export interface InputSchema {
  /** Reference to the space to update. */
  space: string
  readPolicy?:
    | $Typed<ComAtprotoSimplespaceDefs.PublicPolicy>
    | $Typed<ComAtprotoSimplespaceDefs.MemberListPolicy>
    | $Typed<ComAtprotoSimplespaceDefs.ManagingAppPolicy>
    | { $type: string }
  writePolicy?:
    | $Typed<ComAtprotoSimplespaceDefs.PublicPolicy>
    | $Typed<ComAtprotoSimplespaceDefs.MemberListPolicy>
    | $Typed<ComAtprotoSimplespaceDefs.ManagingAppPolicy>
    | { $type: string }
  appAccess?:
    | $Typed<ComAtprotoSimplespaceDefs.Open>
    | $Typed<ComAtprotoSimplespaceDefs.AllowList>
    | { $type: string }
}

export interface CallOptions {
  signal?: AbortSignal
  headers?: HeadersMap
  qp?: QueryParams
  encoding?: 'application/json'
}

export interface Response {
  success: boolean
  headers: HeadersMap
}

export class SpaceNotFoundError extends XRPCError {
  constructor(src: XRPCError) {
    super(src.status, src.error, src.message, src.headers, { cause: src })
  }
}

export class NotSpaceOwnerError extends XRPCError {
  constructor(src: XRPCError) {
    super(src.status, src.error, src.message, src.headers, { cause: src })
  }
}

export class UnsupportedPolicyError extends XRPCError {
  constructor(src: XRPCError) {
    super(src.status, src.error, src.message, src.headers, { cause: src })
  }
}

export class UnsupportedAppAccessError extends XRPCError {
  constructor(src: XRPCError) {
    super(src.status, src.error, src.message, src.headers, { cause: src })
  }
}

export function toKnownErr(e: any) {
  if (e instanceof XRPCError) {
    if (e.error === 'SpaceNotFound') return new SpaceNotFoundError(e)
    if (e.error === 'NotSpaceOwner') return new NotSpaceOwnerError(e)
    if (e.error === 'UnsupportedPolicy') return new UnsupportedPolicyError(e)
    if (e.error === 'UnsupportedAppAccess')
      return new UnsupportedAppAccessError(e)
  }

  return e
}
