import { wikiCategories, wikiPages } from '@/content/wiki';
import WikiClient from './WikiClient';

export default function WikiPage() {
  return <WikiClient categories={wikiCategories} pages={wikiPages} />;
}
