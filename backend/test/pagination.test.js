const test = require("node:test");
const assert = require("node:assert/strict");
const { parsePagination } = require("../src/lib/pagination");

test("pagination uses safe defaults", () => {
  assert.deepEqual(parsePagination({}), { page: 1, limit: 10 });
});

test("pagination accepts valid positive integers", () => {
  assert.deepEqual(
    parsePagination({ page: "2", limit: "25" }),
    { page: 2, limit: 25 }
  );
});

for (const page of ["0", "-1", "abc", "1.5", "2xyz"]) {
  test(`pagination rejects invalid page: ${page}`, () => {
    assert.throws(() => parsePagination({ page }), { status: 400 });
  });
}

for (const limit of ["0", "-5", "abc", "10xyz", "51"]) {
  test(`pagination rejects invalid limit: ${limit}`, () => {
    assert.throws(() => parsePagination({ limit }), { status: 400 });
  });
}

test("pagination accepts maximum limit of 50", () => {
  assert.deepEqual(
    parsePagination({ limit: "50" }),
    { page: 1, limit: 50 }
  );
});
