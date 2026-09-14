import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { Input, MultiSelectChips, SearchInput, TagsInput } from "@erp/ui";

// react-dom/server writes the `autocomplete` DOM property as the attribute
// `autoComplete` verbatim (see react-dom-server's DOM property config) — real
// browsers lowercase HTML attribute names while parsing, so this is the same
// `autocomplete="off"` AC-15..AC-18 describe. Match case-insensitively.
const AUTOCOMPLETE_OFF = /autocomplete="off"/i;

describe("@erp/ui inputs default to autocomplete=off (ADR-05)", () => {
  it("Input renders autocomplete=off by default (AC-17)", () => {
    const html = renderToStaticMarkup(<Input />);
    expect(html).toMatch(AUTOCOMPLETE_OFF);
  });

  it("Input keeps an explicit autoComplete value instead of off (AC-18)", () => {
    const html = renderToStaticMarkup(<Input autoComplete="current-password" />);
    expect(html).toMatch(/autocomplete="current-password"/i);
    expect(html).not.toMatch(AUTOCOMPLETE_OFF);
  });

  it("TagsInput renders its inner input with autocomplete=off (AC-17)", () => {
    const html = renderToStaticMarkup(
      <TagsInput value={[]} onValueChange={() => {}} />,
    );
    expect(html).toMatch(AUTOCOMPLETE_OFF);
  });

  it("MultiSelectChips renders its inner input with autocomplete=off (AC-17)", () => {
    const html = renderToStaticMarkup(
      <MultiSelectChips options={[]} value={[]} onValueChange={() => {}} />,
    );
    expect(html).toMatch(AUTOCOMPLETE_OFF);
  });

  it("SearchInput, built on Input, renders autocomplete=off (AC-16)", () => {
    const html = renderToStaticMarkup(
      <SearchInput value="" onValueChange={() => {}} />,
    );
    expect(html).toMatch(AUTOCOMPLETE_OFF);
  });
});
