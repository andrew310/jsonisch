import { describe, expect, test } from "vitest";
import {
  readRelationConfig,
  relationParentFieldName,
} from "../relation-config";

describe("readRelationConfig", () => {
  test("classifies a schema:// ref with role", () => {
    const config = readRelationConfig({
      type: "array",
      $ref: "schema://party",
      "x-relation-role": "borrower",
    } as never);
    expect(config?.target).toBe("party");
    expect(config?.role).toBe("borrower");
  });

  test("honors x-relation-multiple on the vendor x-relation-target form", () => {
    const config = readRelationConfig({
      type: "object",
      "x-relation-target": "entity",
      "x-relation-multiple": true,
    } as never);
    expect(config?.target).toBe("entity");
    expect(config?.many).toBe(true);
  });

  test("non-relation node classifies undefined", () => {
    expect(readRelationConfig({ type: "string" } as never)).toBeUndefined();
  });

  test("reads x-relation-parent from the vendor flat keys", () => {
    const config = readRelationConfig({
      type: "array",
      "x-relation-target": "contact",
      "x-relation-role": "title-officer",
      "x-relation-parent": "titleCompany",
      "x-relation-multiple": false,
    } as never);
    expect(config?.parent).toBe("titleCompany");
    expect(config?.many).toBe(false);
  });

  test("reads parent from the x-relation namespace", () => {
    const config = readRelationConfig({
      type: "object",
      "x-relation": {
        target: "contact",
        role: "title-officer",
        parent: "titleCompany",
        multiple: false,
      },
    } as never);
    expect(config?.parent).toBe("titleCompany");
  });
});

const TITLE_COMPANY = {
  type: "array",
  "x-relation-target": "entity",
  "x-relation-role": "title-company",
  "x-relation-multiple": false,
  "x-relation-traits": ["title-company"],
};

const TITLE_OFFICER = {
  type: "array",
  "x-relation-target": "contact",
  "x-relation-role": "title-officer",
  "x-relation-multiple": false,
  "x-relation-traits": ["title-company"],
};

const PROD_TITLE_SCHEMA = {
  type: "object",
  properties: {
    titleCompany: TITLE_COMPANY,
    titleOfficer: TITLE_OFFICER,
  },
};

describe("relationParentFieldName", () => {
  test("explicit x-relation-parent wins", () => {
    const relation = readRelationConfig({
      ...TITLE_OFFICER,
      "x-relation-parent": "escrowCompany",
    });
    expect(
      relationParentFieldName(PROD_TITLE_SCHEMA, ["titleOfficer"], relation!),
    ).toBe("escrowCompany");
  });

  test("infers the sibling entity whose role is in the contact's traits (prod artifact shape)", () => {
    const relation = readRelationConfig(TITLE_OFFICER);
    expect(
      relationParentFieldName(PROD_TITLE_SCHEMA, ["titleOfficer"], relation!),
    ).toBe("titleCompany");
  });

  test("does not infer when no sibling entity role is in the contact's traits", () => {
    const closingContact = {
      type: "array",
      "x-relation-target": "contact",
      "x-relation-role": "closing-contact",
      "x-relation-traits": ["lender-employee"],
    };
    const schema = {
      type: "object",
      properties: {
        titleCompany: TITLE_COMPANY,
        closingContact,
      },
    };
    const relation = readRelationConfig(closingContact);
    expect(
      relationParentFieldName(schema, ["closingContact"], relation!),
    ).toBeUndefined();
  });

  test("does not invent a parent when two sibling entities share the role", () => {
    const schema = {
      type: "object",
      properties: {
        titleCompany: TITLE_COMPANY,
        otherTitle: TITLE_COMPANY,
        titleOfficer: TITLE_OFFICER,
      },
    };
    const relation = readRelationConfig(TITLE_OFFICER);
    expect(
      relationParentFieldName(schema, ["titleOfficer"], relation!),
    ).toBeUndefined();
  });
});
