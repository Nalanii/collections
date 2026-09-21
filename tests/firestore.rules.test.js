import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';

/** @type {import('@firebase/rules-unit-testing').RulesTestEnvironment} */
let testEnv;

async function seedFixtures() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    await db.collection('collections').doc('col1').set({ ownerId: 'owner-uid' });

    // A second collection with no members doc yet, used to test the
    // owner-bootstrap self-create path in isolation.
    await db.collection('collections').doc('col-bootstrap').set({ ownerId: 'bootstrap-owner-uid' });

    await db
      .collection('collections')
      .doc('col1')
      .collection('members')
      .doc('owner-uid')
      .set({ role: 'owner', uid: 'owner-uid' });
    await db
      .collection('collections')
      .doc('col1')
      .collection('members')
      .doc('editor-uid')
      .set({ role: 'editor', uid: 'editor-uid' });
    await db
      .collection('collections')
      .doc('col1')
      .collection('members')
      .doc('viewer-uid')
      .set({ role: 'viewer', uid: 'viewer-uid' });

    await db
      .collection('collections')
      .doc('col1')
      .collection('invites')
      .doc('invited@example.com')
      .set({ role: 'editor', invitedBy: 'owner-uid', email: 'invited@example.com' });

    await db.collection('items').doc('item1').set({
      collectionId: 'col1',
      status: 'have',
      createdBy: 'owner-uid',
    });
  });
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'collections-rules-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: 'localhost',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

describe('owner (full access)', () => {
  beforeEach_seed();

  it('can read collections/col1', async () => {
    const db = testEnv.authenticatedContext('owner-uid').firestore();
    await assertSucceeds(db.collection('collections').doc('col1').get());
  });

  it('can update collections/col1', async () => {
    const db = testEnv.authenticatedContext('owner-uid').firestore();
    await assertSucceeds(
      db.collection('collections').doc('col1').update({ name: 'Updated' })
    );
  });

  it('can delete collections/col1', async () => {
    const db = testEnv.authenticatedContext('owner-uid').firestore();
    await assertSucceeds(db.collection('collections').doc('col1').delete());
  });

  it('can read collections/col1/members/*', async () => {
    const db = testEnv.authenticatedContext('owner-uid').firestore();
    await assertSucceeds(
      db.collection('collections').doc('col1').collection('members').doc('editor-uid').get()
    );
  });

  it('can create collections/col1/members/*', async () => {
    const db = testEnv.authenticatedContext('owner-uid').firestore();
    await assertSucceeds(
      db
        .collection('collections')
        .doc('col1')
        .collection('members')
        .doc('new-uid')
        .set({ role: 'viewer' })
    );
  });

  it('can update collections/col1/members/*', async () => {
    const db = testEnv.authenticatedContext('owner-uid').firestore();
    await assertSucceeds(
      db
        .collection('collections')
        .doc('col1')
        .collection('members')
        .doc('editor-uid')
        .update({ role: 'viewer' })
    );
  });

  it('can read collections/col1/invites/*', async () => {
    const db = testEnv.authenticatedContext('owner-uid').firestore();
    await assertSucceeds(
      db
        .collection('collections')
        .doc('col1')
        .collection('invites')
        .doc('invited@example.com')
        .get()
    );
  });

  it('can create collections/col1/invites/*', async () => {
    const db = testEnv.authenticatedContext('owner-uid').firestore();
    await assertSucceeds(
      db
        .collection('collections')
        .doc('col1')
        .collection('invites')
        .doc('new-invite@example.com')
        .set({ role: 'viewer', invitedBy: 'owner-uid' })
    );
  });

  it('can update collections/col1/invites/*', async () => {
    const db = testEnv.authenticatedContext('owner-uid').firestore();
    await assertSucceeds(
      db
        .collection('collections')
        .doc('col1')
        .collection('invites')
        .doc('invited@example.com')
        .update({ role: 'viewer' })
    );
  });

  it('can delete collections/col1/invites/*', async () => {
    const db = testEnv.authenticatedContext('owner-uid').firestore();
    await assertSucceeds(
      db
        .collection('collections')
        .doc('col1')
        .collection('invites')
        .doc('invited@example.com')
        .delete()
    );
  });

  it('can create items with collectionId col1', async () => {
    const db = testEnv.authenticatedContext('owner-uid').firestore();
    await assertSucceeds(
      db.collection('items').add({ collectionId: 'col1', status: 'want', createdBy: 'owner-uid' })
    );
  });

  it('can update items with collectionId col1', async () => {
    const db = testEnv.authenticatedContext('owner-uid').firestore();
    await assertSucceeds(db.collection('items').doc('item1').update({ status: 'want' }));
  });

  it('can delete items with collectionId col1', async () => {
    const db = testEnv.authenticatedContext('owner-uid').firestore();
    await assertSucceeds(db.collection('items').doc('item1').delete());
  });

  it('cannot delete their own members/owner-uid doc (cannot leave)', async () => {
    const db = testEnv.authenticatedContext('owner-uid').firestore();
    await assertFails(
      db.collection('collections').doc('col1').collection('members').doc('owner-uid').delete()
    );
  });

  it('cannot change an item collectionId on update (immutable)', async () => {
    const db = testEnv.authenticatedContext('owner-uid').firestore();
    await assertFails(
      db.collection('items').doc('item1').update({ collectionId: 'other-collection' })
    );
  });
});

describe('editor (read/write items, no collection delete)', () => {
  beforeEach_seed();

  it('can read collections/col1', async () => {
    const db = testEnv.authenticatedContext('editor-uid').firestore();
    await assertSucceeds(db.collection('collections').doc('col1').get());
  });

  it('can update collections/col1', async () => {
    const db = testEnv.authenticatedContext('editor-uid').firestore();
    await assertSucceeds(
      db.collection('collections').doc('col1').update({ name: 'Updated by editor' })
    );
  });

  it('cannot delete collections/col1', async () => {
    const db = testEnv.authenticatedContext('editor-uid').firestore();
    await assertFails(db.collection('collections').doc('col1').delete());
  });

  it('cannot create collections/col1/members/*', async () => {
    const db = testEnv.authenticatedContext('editor-uid').firestore();
    await assertFails(
      db
        .collection('collections')
        .doc('col1')
        .collection('members')
        .doc('new-uid')
        .set({ role: 'viewer' })
    );
  });

  it('cannot update collections/col1/members/*', async () => {
    const db = testEnv.authenticatedContext('editor-uid').firestore();
    await assertFails(
      db
        .collection('collections')
        .doc('col1')
        .collection('members')
        .doc('viewer-uid')
        .update({ role: 'editor' })
    );
  });

  it('cannot delete collections/col1/members/*', async () => {
    const db = testEnv.authenticatedContext('editor-uid').firestore();
    await assertFails(
      db.collection('collections').doc('col1').collection('members').doc('viewer-uid').delete()
    );
  });

  it('can create collections/col1/invites/*', async () => {
    const db = testEnv.authenticatedContext('editor-uid').firestore();
    await assertSucceeds(
      db
        .collection('collections')
        .doc('col1')
        .collection('invites')
        .doc('new-invite@example.com')
        .set({ role: 'viewer', invitedBy: 'editor-uid' })
    );
  });

  it('can update collections/col1/invites/*', async () => {
    const db = testEnv.authenticatedContext('editor-uid').firestore();
    await assertSucceeds(
      db
        .collection('collections')
        .doc('col1')
        .collection('invites')
        .doc('invited@example.com')
        .update({ role: 'viewer' })
    );
  });

  it('can create items with collectionId col1', async () => {
    const db = testEnv.authenticatedContext('editor-uid').firestore();
    await assertSucceeds(
      db.collection('items').add({ collectionId: 'col1', status: 'want', createdBy: 'editor-uid' })
    );
  });

  it('can update items with collectionId col1', async () => {
    const db = testEnv.authenticatedContext('editor-uid').firestore();
    await assertSucceeds(db.collection('items').doc('item1').update({ status: 'want' }));
  });

  it('can delete items with collectionId col1', async () => {
    const db = testEnv.authenticatedContext('editor-uid').firestore();
    await assertSucceeds(db.collection('items').doc('item1').delete());
  });

  it('cannot change ownerId when updating collections/col1', async () => {
    const db = testEnv.authenticatedContext('editor-uid').firestore();
    await assertFails(
      db.collection('collections').doc('col1').update({ ownerId: 'editor-uid' })
    );
  });
});

describe('viewer (read-only)', () => {
  beforeEach_seed();

  it('can read collections/col1', async () => {
    const db = testEnv.authenticatedContext('viewer-uid').firestore();
    await assertSucceeds(db.collection('collections').doc('col1').get());
  });

  it('cannot update collections/col1', async () => {
    const db = testEnv.authenticatedContext('viewer-uid').firestore();
    await assertFails(db.collection('collections').doc('col1').update({ name: 'x' }));
  });

  it('cannot delete collections/col1', async () => {
    const db = testEnv.authenticatedContext('viewer-uid').firestore();
    await assertFails(db.collection('collections').doc('col1').delete());
  });

  it('cannot write members', async () => {
    const db = testEnv.authenticatedContext('viewer-uid').firestore();
    await assertFails(
      db
        .collection('collections')
        .doc('col1')
        .collection('members')
        .doc('new-uid')
        .set({ role: 'viewer' })
    );
  });

  it('cannot write invites', async () => {
    const db = testEnv.authenticatedContext('viewer-uid').firestore();
    await assertFails(
      db
        .collection('collections')
        .doc('col1')
        .collection('invites')
        .doc('new-invite@example.com')
        .set({ role: 'viewer', invitedBy: 'viewer-uid' })
    );
  });

  it('can read items with collectionId col1', async () => {
    const db = testEnv.authenticatedContext('viewer-uid').firestore();
    await assertSucceeds(db.collection('items').doc('item1').get());
  });

  it('cannot create items', async () => {
    const db = testEnv.authenticatedContext('viewer-uid').firestore();
    await assertFails(
      db.collection('items').add({ collectionId: 'col1', status: 'want', createdBy: 'viewer-uid' })
    );
  });

  it('cannot update items', async () => {
    const db = testEnv.authenticatedContext('viewer-uid').firestore();
    await assertFails(db.collection('items').doc('item1').update({ status: 'want' }));
  });

  it('cannot delete items', async () => {
    const db = testEnv.authenticatedContext('viewer-uid').firestore();
    await assertFails(db.collection('items').doc('item1').delete());
  });

  it('can delete their own members/viewer-uid doc (leave collection)', async () => {
    const db = testEnv.authenticatedContext('viewer-uid').firestore();
    await assertSucceeds(
      db.collection('collections').doc('col1').collection('members').doc('viewer-uid').delete()
    );
  });

  it('can query items with a where(collectionId == col1) filter', async () => {
    const db = testEnv.authenticatedContext('viewer-uid').firestore();
    await assertSucceeds(
      db.collection('items').where('collectionId', '==', 'col1').get()
    );
  });

  it('cannot read an unfiltered items collection listing', async () => {
    const db = testEnv.authenticatedContext('viewer-uid').firestore();
    await assertFails(db.collection('items').get());
  });
});

describe('non-member (denied entirely)', () => {
  beforeEach_seed();

  it('cannot read collections/col1', async () => {
    const db = testEnv.authenticatedContext('outsider-uid').firestore();
    await assertFails(db.collection('collections').doc('col1').get());
  });

  it('cannot read collections/col1/members/*', async () => {
    const db = testEnv.authenticatedContext('outsider-uid').firestore();
    await assertFails(
      db.collection('collections').doc('col1').collection('members').doc('owner-uid').get()
    );
  });

  it('cannot read items with collectionId col1', async () => {
    const db = testEnv.authenticatedContext('outsider-uid').firestore();
    await assertFails(db.collection('items').doc('item1').get());
  });

  it('cannot read invites with a non-matching email', async () => {
    const db = testEnv
      .authenticatedContext('outsider-uid', { email: 'outsider@example.com' })
      .firestore();
    await assertFails(
      db
        .collection('collections')
        .doc('col1')
        .collection('invites')
        .doc('invited@example.com')
        .get()
    );
  });

  it('can read the invite doc matching their token email', async () => {
    const db = testEnv
      .authenticatedContext('invitee-uid', { email: 'invited@example.com' })
      .firestore();
    await assertSucceeds(
      db
        .collection('collections')
        .doc('col1')
        .collection('invites')
        .doc('invited@example.com')
        .get()
    );
  });

  it('can delete the invite doc matching their token email', async () => {
    const db = testEnv
      .authenticatedContext('invitee-uid', { email: 'invited@example.com' })
      .firestore();
    await assertSucceeds(
      db
        .collection('collections')
        .doc('col1')
        .collection('invites')
        .doc('invited@example.com')
        .delete()
    );
  });
});

describe('owner bootstrap (self-create first members doc)', () => {
  beforeEach_seed();

  it('the true owner can bootstrap their own members doc when none exists yet', async () => {
    const db = testEnv.authenticatedContext('bootstrap-owner-uid').firestore();
    await assertSucceeds(
      db
        .collection('collections')
        .doc('col-bootstrap')
        .collection('members')
        .doc('bootstrap-owner-uid')
        .set({ role: 'owner' })
    );
  });

  it('a non-owner cannot bootstrap themselves as owner even when no members doc exists', async () => {
    const db = testEnv.authenticatedContext('not-the-owner-uid').firestore();
    await assertFails(
      db
        .collection('collections')
        .doc('col-bootstrap')
        .collection('members')
        .doc('not-the-owner-uid')
        .set({ role: 'owner' })
    );
  });

  it('createCollection\'s sequential create (collections doc, then owner members doc, nothing pre-seeded) succeeds', async () => {
    // Reproduces src/services/collections.js's createCollection exactly: no
    // pre-seeding of the collections doc (unlike the two tests above, which
    // seed collections/col-bootstrap via seedFixtures before writing the
    // members doc), and two separate awaited set() calls rather than a
    // batch or transaction. A writeBatch or runTransaction here fails with
    // PERMISSION_DENIED because the members/{uid} owner-bootstrap rule's
    // get() on the sibling collections doc never sees an uncommitted
    // sibling write from the same batch/transaction -- rules' own
    // get()/exists() calls only see already-committed state. Awaiting the
    // first write's commit before issuing the second is what lets the
    // second write's rule evaluation see the collections doc.
    const db = testEnv.authenticatedContext('new-owner-uid').firestore();
    const collectionRef = db.collection('collections').doc('col-new');
    const memberRef = collectionRef.collection('members').doc('new-owner-uid');

    await assertSucceeds(
      collectionRef.set({
        name: 'New Collection',
        emoji: '🧵',
        ownerId: 'new-owner-uid',
        fieldDefs: [],
      })
    );
    await assertSucceeds(memberRef.set({ role: 'owner' }));
  });

  it('the same create attempted as a single writeBatch (both docs, nothing pre-seeded) fails', async () => {
    // Companion negative test to the one above: proves the reasoning in that
    // test's comment (and in src/services/collections.js's createCollection
    // comment) by actually exercising the batched-write shape the plan
    // originally called for. The members/{uid} owner-bootstrap rule's
    // get(collections/{id}).data.ownerId never sees the collections doc set
    // earlier in the SAME batch, because rules' get()/exists() calls only
    // see already-committed state -- so committing both docs in one
    // writeBatch from unseeded state must fail. If someone reintroduces a
    // batch/transaction in createCollection, this test catches it even
    // though the sequential-setDoc happy-path test above would still pass.
    const db = testEnv.authenticatedContext('batch-owner-uid').firestore();
    const collectionRef = db.collection('collections').doc('col-batch');
    const memberRef = collectionRef.collection('members').doc('batch-owner-uid');

    const batch = db.batch();
    batch.set(collectionRef, {
      name: 'Batched Collection',
      emoji: '🧵',
      ownerId: 'batch-owner-uid',
      fieldDefs: [],
    });
    batch.set(memberRef, { role: 'owner' });

    await assertFails(batch.commit());
  });
});

describe('invite acceptance', () => {
  beforeEach_seed();

  it('an invited user can create their own members doc with the invited role', async () => {
    const db = testEnv
      .authenticatedContext('invitee-uid', { email: 'invited@example.com' })
      .firestore();
    await assertSucceeds(
      db
        .collection('collections')
        .doc('col1')
        .collection('members')
        .doc('invitee-uid')
        .set({ role: 'editor' })
    );
  });

  it('a user with no matching invite cannot create their own members doc', async () => {
    const db = testEnv
      .authenticatedContext('uninvited-uid', { email: 'uninvited@example.com' })
      .firestore();
    await assertFails(
      db
        .collection('collections')
        .doc('col1')
        .collection('members')
        .doc('uninvited-uid')
        .set({ role: 'editor' })
    );
  });
});

describe('collectionGroup members query (Home screen "my collections" lookup)', () => {
  beforeEach_seed();

  it('a member can list their own membership docs across all collections', async () => {
    const db = testEnv.authenticatedContext('editor-uid').firestore();
    const snapshot = await assertSucceeds(
      db.collectionGroup('members').where('uid', '==', 'editor-uid').get()
    );
    expect(snapshot.size).toBe(1);
    expect(snapshot.docs[0].ref.path).toBe('collections/col1/members/editor-uid');
  });

  it('cannot list another user\'s membership docs by filtering on their uid', async () => {
    const db = testEnv.authenticatedContext('editor-uid').firestore();
    await assertFails(db.collectionGroup('members').where('uid', '==', 'owner-uid').get());
  });

  it('an unauthenticated user cannot run the collectionGroup query', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.collectionGroup('members').where('uid', '==', 'owner-uid').get());
  });
});

describe('collectionGroup invites query (pending-invites inbox lookup)', () => {
  beforeEach_seed();

  it('an invited user can list invite docs addressed to their own email', async () => {
    const db = testEnv
      .authenticatedContext('invitee-uid', { email: 'invited@example.com' })
      .firestore();
    const snapshot = await assertSucceeds(
      db.collectionGroup('invites').where('email', '==', 'invited@example.com').get()
    );
    expect(snapshot.size).toBe(1);
    expect(snapshot.docs[0].ref.path).toBe('collections/col1/invites/invited@example.com');
  });

  it('cannot list invites by filtering on someone else\'s email', async () => {
    const db = testEnv
      .authenticatedContext('someone-else-uid', { email: 'someone-else@example.com' })
      .firestore();
    await assertFails(
      db.collectionGroup('invites').where('email', '==', 'invited@example.com').get()
    );
  });

  it('an unauthenticated user cannot run the collectionGroup invites query', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      db.collectionGroup('invites').where('email', '==', 'invited@example.com').get()
    );
  });
});

describe('unauthenticated', () => {
  beforeEach_seed();

  it('cannot read collections/col1', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.collection('collections').doc('col1').get());
  });

  it('cannot write collections/col1', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.collection('collections').doc('col1').update({ name: 'x' }));
  });

  it('cannot read items', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.collection('items').doc('item1').get());
  });

  it('cannot write items', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      db.collection('items').add({ collectionId: 'col1', status: 'want', createdBy: 'x' })
    );
  });
});

// Helper to register a beforeEach that (re-)seeds fixtures for a describe block,
// since afterEach clears Firestore between every test.
function beforeEach_seed() {
  beforeEach(async () => {
    await seedFixtures();
  });
}
