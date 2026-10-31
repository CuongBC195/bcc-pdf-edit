import { CATEGORY_TREE, POPULAR_TOOL_IDS } from './tree';
import { INTERNAL_TOOLS } from './internalTools';
import { PDF_TOOLS } from '../pdf/registry';
import type { CategoryDef, CategoryNode, ToolDef, ToolLocation } from './types';

export type { CategoryDef, CategoryNode, IconName, ToolDef, ToolKind, ToolLocation } from './types';
export { POPULAR_TOOL_IDS } from './tree';

export { INTERNAL_TOOLS } from './internalTools';

const TOOL_ALIASES: Record<string, string> = {
  'pdf-multi-split': 'bcc-multi-split',
  'qr-studio': 'qr-generator',
};

export const ALL_TOOLS: readonly ToolDef[] = [...INTERNAL_TOOLS, ...PDF_TOOLS];

export const TOOLS_BY_ID: ReadonlyMap<string, ToolDef> = new Map(
  ALL_TOOLS.map((tool) => [tool.id, tool])
);

const assignedToolIds = new Set<string>();
const categoryByPath = new Map<string, { node: CategoryNode; trail: CategoryNode[] }>();
const toolLocations = new Map<string, ToolLocation>();
const allCategoriesFlat: CategoryNode[] = [];

function buildCategoryNode(
  def: CategoryDef,
  parentPath: string[],
  inheritedAccent: string,
  parentTrail: CategoryNode[]
): CategoryNode {
  const path = [...parentPath, def.slug];
  const accent = def.accent ?? inheritedAccent;
  const tools: ToolDef[] = [];

  for (const id of def.tools ?? []) {
    const tool = TOOLS_BY_ID.get(id);
    if (tool) {
      tools.push(tool);
      assignedToolIds.add(tool.id);
    }
  }

  const node: CategoryNode = {
    slug: def.slug,
    path,
    name: def.name,
    description: def.description,
    icon: def.icon,
    accent,
    children: [],
    tools,
    totalTools: 0,
  };

  const currentTrail = [...parentTrail, node];
  node.children = (def.children ?? []).map((child) =>
    buildCategoryNode(child, path, accent, currentTrail)
  );

  const uniqueIds = new Set<string>();
  const collectIds = (n: CategoryNode) => {
    for (const t of n.tools) uniqueIds.add(t.id);
    for (const c of n.children) collectIds(c);
  };
  collectIds(node);
  node.totalTools = uniqueIds.size;

  categoryByPath.set(path.join('/'), { node, trail: currentTrail });
  allCategoriesFlat.push(node);

  for (const tool of tools) {
    if (!toolLocations.has(tool.id)) {
      toolLocations.set(tool.id, { tool, trail: currentTrail });
    }
  }

  return node;
}

const builtRoots: CategoryNode[] = CATEGORY_TREE.map((def) =>
  buildCategoryNode(def, [], def.accent ?? '#06b6d4', [])
);

const unassignedTools = ALL_TOOLS.filter((t) => !assignedToolIds.has(t.id));
if (unassignedTools.length > 0) {
  const fallbackNode = buildCategoryNode(
    {
      slug: 'khac',
      name: 'Công cụ khác',
      description: 'Các công cụ tiện ích bổ sung.',
      icon: 'ph-dots-three-circle',
      accent: '#64748b',
      tools: unassignedTools.map((t) => t.id),
    },
    [],
    '#64748b',
    []
  );
  builtRoots.push(fallbackNode);
}

export const ROOT_CATEGORIES: readonly CategoryNode[] = builtRoots;
export const TOTAL_TOOL_COUNT: number = ALL_TOOLS.length;

export function resolveToolId(id: string): string {
  return TOOL_ALIASES[id] ?? id;
}

export function findToolById(id: string): ToolDef | undefined {
  return TOOLS_BY_ID.get(resolveToolId(id));
}

export function findToolLocation(id: string): ToolLocation | undefined {
  return toolLocations.get(resolveToolId(id));
}

export function findCategoryByPath(
  slugs: string[] | string
): { node: CategoryNode; trail: CategoryNode[] } | undefined {
  const key = Array.isArray(slugs)
    ? slugs.filter(Boolean).join('/')
    : slugs.replace(/^\/+|\/+$/g, '');
  return categoryByPath.get(key) ?? categoryByPath.get(`xu-ly-pdf/${key}`);
}

/** Thu thập toàn bộ công cụ thuộc một nhánh danh mục (không trùng lặp) */
export function collectCategoryTools(node: CategoryNode): ToolLocation[] {
  const seen = new Set<string>();
  const result: ToolLocation[] = [];

  const visit = (n: CategoryNode) => {
    for (const t of n.tools) {
      if (!seen.has(t.id)) {
        seen.add(t.id);
        const loc = toolLocations.get(t.id);
        if (loc) result.push(loc);
      }
    }
    for (const c of n.children) visit(c);
  };

  visit(node);
  return result;
}

/** Đường dẫn mở công cụ */
export function getToolHref(tool: ToolDef): string {
  return `/t/${tool.id}`;
}

/** Đường dẫn mở danh mục */
export function getCategoryHref(node: CategoryNode): string {
  return `/c/${node.path.join('/')}`;
}

/** Bỏ dấu tiếng Việt và chuẩn hóa chuỗi để tìm kiếm nhanh */
export function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface SearchIndexEntry {
  location: ToolLocation;
  normName: string;
  normKeywords: string;
  normDesc: string;
}

const searchIndex: SearchIndexEntry[] = ALL_TOOLS.map((tool) => {
  const loc = toolLocations.get(tool.id) ?? { tool, trail: [] };
  return {
    location: loc,
    normName: normalizeSearchText(tool.name),
    normKeywords: normalizeSearchText([tool.id, ...(tool.keywords ?? [])].join(' ')),
    normDesc: normalizeSearchText(tool.description),
  };
});

export function searchCatalog(query: string): {
  categories: CategoryNode[];
  tools: ToolLocation[];
} {
  const normQuery = normalizeSearchText(query);
  if (!normQuery) {
    return { categories: [], tools: [] };
  }
  const tokens = normQuery.split(' ').filter(Boolean);

  const matchedCategories = allCategoriesFlat.filter((cat) => {
    const hay = normalizeSearchText(`${cat.name} ${cat.description}`);
    return tokens.every((tk) => hay.includes(tk));
  });

  const scoredTools: { location: ToolLocation; score: number }[] = [];
  for (const entry of searchIndex) {
    const fullText = `${entry.normName} ${entry.normKeywords} ${entry.normDesc}`;
    if (!tokens.every((tk) => fullText.includes(tk))) continue;

    let score = 0;
    if (entry.normName === normQuery) score += 100;
    else if (entry.normName.startsWith(normQuery)) score += 60;
    else if (entry.normName.includes(normQuery)) score += 40;

    if (entry.normKeywords.includes(normQuery)) score += 30;
    for (const tk of tokens) {
      if (entry.normName.includes(tk)) score += 12;
      if (entry.normKeywords.includes(tk)) score += 8;
    }
    if (entry.location.tool.kind === 'internal') score += 5;

    scoredTools.push({ location: entry.location, score });
  }

  scoredTools.sort((a, b) => b.score - a.score);

  return {
    categories: matchedCategories.slice(0, 8),
    tools: scoredTools.map((s) => s.location),
  };
}

export const POPULAR_TOOLS: readonly ToolLocation[] = POPULAR_TOOL_IDS.map((id) =>
  findToolLocation(id)
).filter((loc): loc is ToolLocation => Boolean(loc));
