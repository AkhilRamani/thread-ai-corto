import "server-only";
import { passageId } from "./passage-id";
import { z } from "zod";
import {
  pageIdSchema,
  type Evidence,
  type PageOption,
  type Passage,
} from "@/lib/contracts";
import { limits } from "@/lib/limits";
import { providerRequest, type RequestBudget } from "./http";
import { ProjectError } from "./errors";

export const NOTION_VERSION = "2026-03-11";
const richText = z.array(z.object({ plain_text: z.string() }));
const pageSchema = z.object({
  id: pageIdSchema,
  object: z.literal("page"),
  url: z.url(),
  last_edited_time: z.iso.datetime(),
  created_time: z.iso.datetime().optional(),
  created_by: z.object({ id: pageIdSchema }).optional(),
  last_edited_by: z.object({ id: pageIdSchema }).optional(),
  archived: z.boolean().optional(),
  in_trash: z.boolean().optional(),
  properties: z.record(z.string(), z.unknown()),
});
const blockSchema = z
  .object({
    id: pageIdSchema,
    type: z.string(),
    has_children: z.boolean(),
    last_edited_time: z.string().optional(),
  })
  .catchall(z.unknown());
const blockListSchema = z.object({
  results: z.array(blockSchema),
  has_more: z.boolean(),
  next_cursor: z.string().nullable(),
});
function pageOption(raw: z.infer<typeof pageSchema>): PageOption {
  const url = new URL(raw.url);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    ![
      "notion.so",
      "www.notion.so",
      "notion.com",
      "www.notion.com",
      "app.notion.com",
    ].includes(url.hostname)
  )
    throw new ProjectError(
      "notion",
      "unavailable",
      "Notion returned an invalid page link.",
    );
  const titleProperty = Object.values(raw.properties).find(
    (value) => z.object({ type: z.literal("title") }).safeParse(value).success,
  );
  const title = z.object({ title: richText }).safeParse(titleProperty);
  return {
    id: raw.id,
    title: (title.success
      ? title.data.title.map((t) => t.plain_text).join("")
      : "Untitled page"
    ).slice(0, 200),
    updatedAt: raw.last_edited_time,
    url: url.toString(),
  };
}
export function notionRequest(
  path: string,
  token: string,
  budget: RequestBudget,
  body?: object,
) {
  return providerRequest(
    "notion",
    `https://api.notion.com/v1${path}`,
    {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
    budget,
  );
}
export async function listNotionPages(token: string, budget: RequestBudget) {
  const raw = z
    .object({ results: z.array(pageSchema), has_more: z.boolean() })
    .parse(
      await notionRequest("/search", token, budget, {
        query: "",
        filter: { property: "object", value: "page" },
        sort: { direction: "descending", timestamp: "last_edited_time" },
        page_size: limits.pickerResults,
      }),
    );
  return {
    pages: raw.results
      .filter((p) => !p.archived && !p.in_trash)
      .map(pageOption),
    capped: raw.has_more,
  };
}
export async function readNotionPage(
  id: string,
  token: string,
  budget: RequestBudget,
): Promise<Evidence> {
  pageIdSchema.parse(id);
  const raw = pageSchema.parse(
    await notionRequest(`/pages/${id}`, token, budget),
  );
  if (raw.id !== id || raw.archived || raw.in_trash)
    throw new ProjectError(
      "notion",
      "unavailable",
      "The selected Notion page is no longer available.",
    );
  const page = pageOption(raw);
  const passages: Passage[] = [];
  const limitations: string[] = [];
  let count = 0;
  async function walk(blockId: string, depth: number, inheritedHeading = "") {
    let cursor: string | null = null;
    let heading = inheritedHeading;
    do {
      const params = new URLSearchParams({
        page_size: String(limits.pageSize),
        ...(cursor ? { start_cursor: cursor } : {}),
      });
      const list = blockListSchema.parse(
        await notionRequest(
          `/blocks/${blockId}/children?${params}`,
          token,
          budget,
        ),
      );
      for (const block of list.results) {
        if (++count > limits.blocks) {
          limitations.push(
            "Page block limit reached; later blocks were omitted.",
          );
          return;
        }
        if (
          [
            "child_page",
            "child_database",
            "link_to_page",
            "synced_block",
          ].includes(block.type)
        ) {
          limitations.push(
            `Unselected or linked content (${block.type}) was not followed.`,
          );
          continue;
        }
        const content = z
          .object({ rich_text: richText })
          .safeParse(block[block.type]);
        const table = z
          .object({ cells: z.array(richText) })
          .safeParse(block[block.type]);
        const full = content.success
          ? content.data.rich_text.map((t) => t.plain_text).join("")
          : table.success
            ? table.data.cells
                .map((c) => c.map((t) => t.plain_text).join(""))
                .join(" | ")
            : "";
        if (block.type.startsWith("heading_")) heading = full.slice(0, 200);
        if (full.trim())
          passages.push({
            id: passageId(`notion-${id}`, block.id),
            blockId: block.id,
            heading,
            text: full.slice(0, limits.textCharacters),
          });
        if (full.length > limits.textCharacters)
          limitations.push("Long block text was truncated.");
        if (
          !full &&
          ![
            "divider",
            "column_list",
            "column",
            "table",
            "table_of_contents",
          ].includes(block.type)
        )
          limitations.push(
            `Non-text or unsupported ${block.type} content was not inspected.`,
          );
        if (block.has_children) {
          if (depth >= limits.depth)
            limitations.push("Nested block depth limit reached.");
          else await walk(block.id, depth + 1, heading);
        }
      }
      cursor = list.has_more ? list.next_cursor : null;
      if (list.has_more && !cursor)
        limitations.push(
          "Notion did not supply a cursor for remaining blocks.",
        );
    } while (cursor && count < limits.blocks);
  }
  try {
    await walk(id, 0);
  } catch (error) {
    if (error instanceof ProjectError && error.code === "unauthorized")
      throw error;
    limitations.push(
      error instanceof ProjectError
        ? error.message
        : "Some page blocks could not be read.",
    );
    if (error instanceof ProjectError && error.retryAfter) throw error;
  }
  if (!passages.length)
    limitations.push("No usable text was retrieved from this page.");
  return {
    id: `notion-${id}`,
    provider: "notion",
    kind: "page",
    layer: "document",
    title: page.title,
    url: page.url,
    updatedAt: page.updatedAt,
    createdAt: raw.created_time,
    author: raw.last_edited_by?.id ?? raw.created_by?.id,
    role: raw.last_edited_by
      ? "last editor (provider user ID)"
      : raw.created_by
        ? "creator (provider user ID)"
        : undefined,
    fetchedAt: new Date().toISOString(),
    passages,
    limitations: [...new Set(limitations)],
  };
}
