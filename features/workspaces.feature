@phase2
Feature: Workspace membership and discovery
  Teams share a workspace while every PDS member list remains the read gate.

  Rule: Invitations establish access before they are reported complete

    Scenario: Invite a member to a workspace with public channels
      Given a workspace has one active owner and two public channels
      When an admin invites a DID that is not a workspace member
      Then the DID has read and write access to the workspace
      And the DID has write-only access to the admin inbox
      And the DID has read and write access to each public channel
      And the invite is reported complete only after every member list matches

    Scenario: A forwarded workspace URI does not grant access
      Given a DID is absent from a workspace member list
      When that DID opens a forwarded workspace URI
      Then it cannot obtain a workspace read credential

    Scenario: Accept an invitation and discover it in a second app
      Given an invitee has been added to the workspace member list
      When the invitee writes an acceptance marker to their own repo
      Then the workspace appears in that account's spaces index
      And a second app reads the same directory and workspace roster

  Rule: Workspace administration follows current authority state

    Scenario: The authority remains the first active admin
      Given a workspace authority DID owns the workspace
      When the workspace is created
      Then an authority-authored active admin record exists for that DID
      And the authority can read the workspace without a member-list entry

    Scenario: A user-level admin record does not authorize PDS management
      Given a user has an active authority-authored admin record
      When that user calls a member-management operation without the authority session
      Then the PDS rejects the operation

    Scenario: The final admin cannot leave or be demoted
      Given a workspace has one active admin
      When that admin leaves, is removed, or is demoted
      Then the operation is rejected

    Scenario: Promote and demote an admin
      Given a current workspace member is not an admin
      When an admin promotes that member
      Then the member receives inbox read access and an active admin record
      When the member is demoted
      Then inbox read access is removed before the admin record becomes inactive
