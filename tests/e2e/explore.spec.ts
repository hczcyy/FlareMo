import { expect, test } from "@playwright/test";

// /explore sits on the public side of the auth guard (beside /share): an
// anonymous visitor must see the public timeline, never the /login redirect.
// The route tree change that added it is exactly the kind of guard refactor
// that stranded anonymous visitors before (2026-09-10 regression), so this
// spec pins the contract.
test("serves the explore timeline to an anonymous visitor", async ({
  page,
}) => {
  await page.context().clearCookies();

  await page.goto("/explore");
  // No bounce to /login: the URL stays on /explore and the loading screen is
  // never the resting state.
  await expect(page).toHaveURL(/\/explore$/);
  await expect(page.getByText(/^加载中…$|^Loading…$/)).toHaveCount(0);
  // The page renders its own chrome whether the public corpus is empty or
  // populated.
  await expect(
    page.getByRole("heading", { name: /^探索$|^Explore$/ }),
  ).toBeVisible();
});

// The detail page behind a timeline timestamp is also public: an unknown id
// must surface the "unavailable" card on /explore/:id — never a /login
// redirect. Using a nonexistent id keeps the spec independent of seeded
// public memos.
test("keeps an anonymous visitor on the public detail page", async ({
  page,
}) => {
  await page.context().clearCookies();

  await page.goto("/explore/memos-does-not-exist");
  await expect(page).toHaveURL(/\/explore\/memos-does-not-exist$/);
  await expect(
    page.getByText(/^分享不可用|^This share is unavailable$/),
  ).toBeVisible();
});
