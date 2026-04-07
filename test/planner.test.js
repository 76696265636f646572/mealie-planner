import test from 'node:test';
import assert from 'node:assert/strict';

import { fillRange } from '../src/planner.js';

function makeFakeMealie({ existing = [], createResult = (body) => ({ id: `${body.date}-${body.entryType}`, recipe: { slug: 'x' } }) } = {}) {
    const calls = [];
    return {
        calls,
        mealie: {
            async getMealPlans() {
                return { items: existing };
            },
            async createRandomPlanEntry(body) {
                calls.push({ ...body });
                return createResult(body);
            },
        },
    };
}

test('creates in global order: all dinners, then lunches, then breakfasts (chronological by day)', async () => {
    const { mealie, calls } = makeFakeMealie();
    const start = '2026-04-07';
    const end = '2026-04-09';

    await fillRange({ mealie, start, end, categories: ['dinner', 'lunch', 'breakfast'] });

    assert.deepEqual(calls, [
        { date: '2026-04-07', entryType: 'dinner' },
        { date: '2026-04-08', entryType: 'dinner' },
        { date: '2026-04-09', entryType: 'dinner' },
        { date: '2026-04-07', entryType: 'lunch' },
        { date: '2026-04-08', entryType: 'lunch' },
        { date: '2026-04-09', entryType: 'lunch' },
        { date: '2026-04-07', entryType: 'breakfast' },
        { date: '2026-04-08', entryType: 'breakfast' },
        { date: '2026-04-09', entryType: 'breakfast' },
    ]);
});

test('does not create when a slot already has a recipe', async () => {
    const existing = [
        { date: '2026-04-07', entryType: 'dinner', recipeId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' },
        { date: '2026-04-08', entryType: 'lunch', recipe: { slug: 'already-filled' } },
    ];
    const { mealie, calls } = makeFakeMealie({ existing });

    const start = '2026-04-07';
    const end = '2026-04-08';
    await fillRange({ mealie, start, end, categories: ['dinner', 'lunch'] });

    assert.deepEqual(calls, [
        // dinner: 04-07 is filled, 04-08 is missing
        { date: '2026-04-08', entryType: 'dinner' },
        // lunch: 04-07 is missing, 04-08 is filled
        { date: '2026-04-07', entryType: 'lunch' },
    ]);
});

