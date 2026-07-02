'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import type { WikiCategory, WikiCategoryId, WikiPage } from '@/content/wiki';
import styles from './page.module.css';

type WikiClientProps = {
  categories: WikiCategory[];
  pages: WikiPage[];
};

const ALL_CATEGORIES = 'all';

function categoryImageSrc(categoryId: WikiCategoryId) {
  return `/wiki/${categoryId}.svg`;
}

function pageSearchText(page: WikiPage) {
  const blockText = page.blocks
    .map((block) =>
      [
        block.heading,
        ...(block.paragraphs ?? []),
        ...(block.bullets ?? []),
        ...(block.steps ?? []),
        ...(block.scriptLines ?? []),
        ...(block.table?.headers ?? []),
        ...(block.table?.rows.flat() ?? []),
        block.note ?? '',
      ].join(' ')
    )
    .join(' ');

  return [page.title, page.summary, page.audience, page.tags.join(' '), page.sourceFiles.join(' '), blockText].join(' ').toLowerCase();
}

export default function WikiClient({ categories, pages }: WikiClientProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<WikiCategoryId | typeof ALL_CATEGORIES>(ALL_CATEGORIES);
  const [activePageId, setActivePageId] = useState(pages[0]?.id ?? '');
  const deferredQuery = useDeferredValue(query);

  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const searchIndex = useMemo(() => pages.map((page) => ({ page, text: pageSearchText(page) })), [pages]);

  const filteredPages = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();

    return searchIndex
      .filter(({ page, text }) => {
        const categoryMatches = categoryFilter === ALL_CATEGORIES || page.categoryId === categoryFilter;
        const queryMatches = !normalizedQuery || text.includes(normalizedQuery);
        return categoryMatches && queryMatches;
      })
      .map(({ page }) => page);
  }, [categoryFilter, deferredQuery, searchIndex]);

  const activePage = useMemo(() => {
    return pages.find((page) => page.id === activePageId) ?? filteredPages[0] ?? pages[0];
  }, [activePageId, filteredPages, pages]);

  const activeCategory = activePage ? categoryById.get(activePage.categoryId) : null;
  const tagCount = useMemo(() => new Set(pages.flatMap((page) => page.tags)).size, [pages]);
  const relatedPages = activePage?.relatedPageIds
    ?.map((id) => pages.find((page) => page.id === id))
    .filter((page): page is WikiPage => Boolean(page));

  return (
    <main className={styles.page} lang="ko-KR">
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.headerText}>
            <div className={styles.titleRow}>
              <h1>업무 위키</h1>
              <span className={styles.dateBadge}>정리 기준 2026.07.02</span>
            </div>
            <p>섭외센터 매뉴얼, TM 스크립트, 서비스 브로셔, 운영 규정을 한 곳에서 검색합니다.</p>
          </div>
          <div className={styles.headerActions}>
            <button type="button" onClick={() => router.back()} className={styles.secondaryButton}>
              이전 화면
            </button>
            <button type="button" onClick={() => router.push('/hr/calendar')} className={styles.secondaryButton}>
              휴가관리
            </button>
          </div>
        </header>

        <section className={styles.stats} aria-label="위키 요약">
          <div>
            <span>{pages.length}</span>
            <p>문서</p>
          </div>
          <div>
            <span>{categories.length}</span>
            <p>분류</p>
          </div>
          <div>
            <span>{tagCount}</span>
            <p>검색 태그</p>
          </div>
        </section>

        <section className={styles.searchPanel} aria-label="문서 검색">
          <label htmlFor="wiki-search">검색어</label>
          <input
            id="wiki-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="예: DB등록, 병특, ISO, 수수료, 퇴사자"
          />
        </section>

        <div className={styles.contentGrid}>
          <aside className={styles.sidebar} aria-label="위키 문서 목록">
            <div className={styles.filterGroup}>
              <button
                type="button"
                onClick={() => setCategoryFilter(ALL_CATEGORIES)}
                className={categoryFilter === ALL_CATEGORIES ? styles.activeFilter : styles.filterButton}
              >
                전체
              </button>
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setCategoryFilter(category.id)}
                  className={categoryFilter === category.id ? styles.activeFilter : styles.filterButton}
                >
                  {category.title}
                </button>
              ))}
            </div>

            <div className={styles.resultMeta}>
              검색 결과 <b>{filteredPages.length}</b>건
            </div>

            <nav className={styles.pageList}>
              {filteredPages.length === 0 ? (
                <div className={styles.emptyState}>
                  <b>검색 결과가 없습니다.</b>
                  <span>다른 현장 용어나 상품명을 입력해보세요.</span>
                </div>
              ) : (
                filteredPages.map((page) => {
                  const category = categoryById.get(page.categoryId);
                  const selected = page.id === activePage?.id;

                  return (
                    <button
                      key={page.id}
                      type="button"
                      onClick={() => setActivePageId(page.id)}
                      className={selected ? styles.activePageButton : styles.pageButton}
                      aria-current={selected ? 'page' : undefined}
                    >
                      <Image src={categoryImageSrc(page.categoryId)} alt="" width={108} height={72} className={styles.listThumb} />
                      <span className={styles.pageButtonText}>
                        <span>{category?.title}</span>
                        <strong>{page.title}</strong>
                        <small>{page.summary}</small>
                      </span>
                    </button>
                  );
                })
              )}
            </nav>
          </aside>

          {activePage ? (
            <article className={styles.article}>
              <div className={styles.articleHeader}>
                <div className={styles.articleIntro}>
                  <div className={styles.categoryLabel}>{activeCategory?.title ?? '문서'}</div>
                  <h2>{activePage.title}</h2>
                  <p>{activePage.summary}</p>
                </div>
                <div className={styles.visualPanel}>
                  <Image
                    src={categoryImageSrc(activePage.categoryId)}
                    alt={`${activeCategory?.title ?? '업무'} 이미지`}
                    width={320}
                    height={180}
                    className={styles.heroImage}
                  />
                  <div className={styles.audienceBox}>
                    <span>대상</span>
                    <b>{activePage.audience}</b>
                  </div>
                </div>
              </div>

              <div className={styles.tagList}>
                {activePage.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>

              <div className={styles.body}>
                {activePage.blocks.map((block) => (
                  <section key={block.heading} className={styles.block}>
                    <h3>{block.heading}</h3>
                    {block.paragraphs?.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                    {block.steps ? (
                      <ol>
                        {block.steps.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ol>
                    ) : null}
                    {block.bullets ? (
                      <ul>
                        {block.bullets.map((bullet) => (
                          <li key={bullet}>{bullet}</li>
                        ))}
                      </ul>
                    ) : null}
                    {block.table ? (
                      <div className={styles.tableScroll}>
                        <table>
                          <thead>
                            <tr>
                              {block.table.headers.map((header) => (
                                <th key={header}>{header}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {block.table.rows.map((row) => (
                              <tr key={row.join('|')}>
                                {row.map((cell, index) => (
                                  <td key={`${cell}-${index}`}>{cell}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                    {block.scriptLines ? (
                      <div className={styles.scriptBox}>
                        {block.scriptLines.map((line) => (
                          <p key={line}>{line}</p>
                        ))}
                      </div>
                    ) : null}
                    {block.note ? <div className={styles.note}>{block.note}</div> : null}
                  </section>
                ))}
              </div>

              {relatedPages && relatedPages.length > 0 ? (
                <section className={styles.related} aria-label="관련 문서">
                  <h3>관련 문서</h3>
                  <div>
                    {relatedPages.map((page) => (
                      <button key={page.id} type="button" onClick={() => setActivePageId(page.id)}>
                        {page.title}
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}
            </article>
          ) : null}
        </div>
      </div>
    </main>
  );
}
