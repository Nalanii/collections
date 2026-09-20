import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
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

    await db
      .collection('collections')
      .doc('col1')
      .collection('members')
      .doc('owner-uid')
      .set({ role: 'owner' });
    await db
      .collection('collections')
      .doc('col1')
      .collection('members')
      .doc('editor-uid')
      .set({ role: 'editor' });
    await db
      .collection('collections')
      .doc('col1')
      .collection('members')
      .doc('viewer-uid')
      .set({ role: 'viewer' });

    await db
      .collection('collections')
      .doc('col1')
      .collection('invites')
      .doc('invited@example.com')
      .set({ role: 'editor', invitedBy: 'owner-uid' });

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
});

describe('editor (read/write items, no collection delete)', () => {
  beforeEach_seed();

  it('can read collections/col1', async () => {
    const db = testEnv.authenticatedContext('editor-uid').firestore();
    await assertSucceeds(db.collection('collections').doc('col1').get());
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
