import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CLAIM_LABEL,
  OWNER_LABEL,
  SEEDED_LABEL,
  claimListingHref,
  listingCategory,
  listingContactActions,
  listingInitials,
  listingOrigin,
  listingPitch,
  listingSkillChips,
} from "./cards.ts";

describe("directory cards", () => {
  it("shortens seed pitches into a footnote and keeps the real offer", () => {
    const seed = listingPitch({
      pitch: "Open-source platform to build agents. Listed from public registry - unclaimed.",
      contact: "https://agpt.co",
    });
    assert.equal(seed.pitch, "Open-source platform to build agents.");
    assert.equal(seed.footnote, null);
    assert.equal(listingOrigin({ pitch: seed.pitch, contact: "https://agpt.co", listed_by: "seed" }), "seed");
    assert.equal(
      listingOrigin({
        pitch: "Open-source platform to build agents. Listed from public registry - unclaimed.",
        contact: "https://agpt.co",
      }),
      "seed",
    );
    assert.doesNotMatch(seed.pitch, /unclaimed/i);

    const info = listingPitch({
      pitch: "Open-source coding agent that runs in your IDE. Listed from public info; not affiliated.",
      contact: "https://continue.dev",
    });
    assert.equal(info.pitch, "Open-source coding agent that runs in your IDE.");
    assert.equal(info.footnote, null);
    assert.equal(
      listingOrigin({
        pitch: "Hosted sessions. Listed by Agent Control from public info; not affiliated.",
        contact: "https://steel.dev",
      }),
      "seed",
    );

    const own = listingPitch({
      pitch:
        "We list your agent on the public directory. $49. We do not run your agent.",
      contact: "support@agent-control.net",
    });
    assert.equal(own.pitch, "We list your agent on the public directory.");
    assert.equal(own.footnote, "An Agent Control service, not an outside agent.");

    const human = listingPitch({
      pitch: "I write research briefs for product teams.",
      contact: "ada@example.com",
    });
    assert.equal(human.pitch, "I write research briefs for product teams.");
    assert.equal(human.footnote, null);
    assert.equal(listingOrigin({ pitch: human.pitch, contact: "ada@example.com" }), "owner");
    assert.equal(listingOrigin({ pitch: human.pitch, contact: "ada@example.com", listed_by: "owner" }), "owner");
    assert.equal(SEEDED_LABEL, "Seeded · unclaimed");
    assert.equal(OWNER_LABEL, "Listed by owner");
    assert.equal(CLAIM_LABEL, "Claim this listing");
    assert.equal(
      claimListingHref("agent_0123456789abcdef01234567"),
      "mailto:support@agent-control.net?subject=Claim%20listing%20agent_0123456789abcdef01234567",
    );
  });

  it("shows initials, three skills, and a contact action", () => {
    assert.equal(listingInitials("Ada Lovelace"), "AL");
    assert.equal(listingInitials("codex"), "CO");
    assert.deepEqual(listingSkillChips(["one", "two", "three", "four"]), ["one", "two", "three"]);
    assert.deepEqual(
      listingContactActions({ contact: "ada@example.com", link: "https://ada.example" }),
      [
        { label: "Email", href: "mailto:ada@example.com" },
        { label: "Open site", href: "https://ada.example" },
      ],
    );
    assert.deepEqual(listingContactActions({ contact: "https://agpt.co", link: null }), [
      { label: "Open site", href: "https://agpt.co" },
    ]);
  });

  it("sorts work into human categories and leaves the rest in Other", () => {
    assert.equal(
      listingCategory({ name: "Scout", skills: ["papers"], pitch: "I do research." }),
      "Research",
    );
    assert.equal(
      listingCategory({ name: "codex", skills: ["terminal"], pitch: "A coding agent." }),
      "Code",
    );
    assert.equal(
      listingCategory({ name: "Desk", skills: ["notes"], pitch: "I keep a quiet list." }),
      "Other",
    );
  });
});