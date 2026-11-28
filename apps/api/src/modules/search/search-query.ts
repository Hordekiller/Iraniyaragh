import { Prisma } from '@prisma/client';

/** Only the Persian keyboard mapping is automatic; catalog aliases are reviewed in Admin. */
export function keyboardAlternative(input: string): string | null {
  if (!/^[a-z,;[\]'\s]+$/i.test(input) || input.length < 3) return null;
  const latin = 'qwertyuiop[]asdfghjkl;\'zxcvbnm,';
  const persian = 'ضصثقفغعهخحجچشسیبلاتنمکگظطزرذدئو';
  const result = [...input.toLowerCase()].map(char => latin.includes(char) ? persian[latin.indexOf(char)] : char).join('');
  return result === input ? null : result;
}

export function rankedSearchSql(queries: string[]): Prisma.Sql {
  const branches: Prisma.Sql[] = [];
  queries.forEach((query, queryIndex) => {
    const tokens = query.split(' ').filter(Boolean).slice(0, 8);
    tokens.forEach((token, tokenIndex) => {
      const protectedToken = /^[0-9]+$/.test(token);
      const fuzzy = !protectedToken && /^[ء-ی]{4,}$/u.test(token);
      // Four-letter Persian words have many accidental one-edit neighbours.
      // Accept their typo matches only in prominent catalog fields, not in a
      // passing description word such as لوله for the query لولا.
      const shortFuzzyWeight = token.length === 4 ? Prisma.sql`AND t.weight >= 60` : Prisma.empty;
      const prefix = `${token}%`;
      const predicate = protectedToken ? Prisma.sql`t.term = ${token}` : Prisma.sql`(t.term LIKE ${prefix} ${fuzzy ? Prisma.sql`OR (t.term % ${token} AND abs(length(t.term)-${token.length}) <= 1 AND levenshtein_less_equal(t.term, ${token}, 1) <= 1 ${shortFuzzyWeight})` : Prisma.empty})`;
      branches.push(Prisma.sql`SELECT t."documentId", ${queryIndex} AS alternative, ${tokenIndex} AS token, ${tokens.length} AS required,
        max(t.weight + CASE WHEN t.term=${token} THEN 40 WHEN t.term LIKE ${prefix} THEN 20 ELSE 0 END) AS score
        FROM "SearchTerm" t WHERE ${predicate} GROUP BY t."documentId"`);
    });
  });
  if (!branches.length) return Prisma.sql`SELECT NULL::text AS id, 0::numeric AS score WHERE FALSE`;
  const exact = queries.map(q => Prisma.sql`CASE WHEN d.identifier=${q.replaceAll(' ', '')} THEN 10000 WHEN d.title=${q} THEN 3000 WHEN replace(d.title,' ','')=${q.replaceAll(' ', '')} THEN 2900 WHEN d.title LIKE ${`${q}%`} THEN 2000 ELSE 0 END`);
  return Prisma.sql`WITH tokens AS (${Prisma.join(branches, ' UNION ALL ')}), documents AS (
      SELECT "documentId", alternative, sum(score) AS score FROM tokens GROUP BY "documentId", alternative HAVING count(DISTINCT token)=max(required)
    ) SELECT d."productId" AS id, max(m.score + greatest(${Prisma.join(exact)}) + coalesce(k.boost,0)) AS score
    FROM documents m JOIN "SearchDocument" d ON d.id=m."documentId"
    JOIN "ProductVariant" v ON v.id=d.id AND v."isActive" AND v.status='ACTIVE'
    JOIN "Product" p ON p.id=d."productId" AND p.status='ACTIVE'
    LEFT JOIN "SearchProductKeywords" k ON k."productId"=p.id GROUP BY d."productId"`;
}
