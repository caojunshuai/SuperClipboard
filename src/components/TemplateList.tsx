import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Template } from '../types';
import { getTemplates, addTemplate, updateTemplate, deleteTemplate } from '../api';
import TemplateCard from './TemplateCard';

export default function TemplateList() {
  const { t } = useTranslation();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTemplates = useCallback(async () => {
    try {
      const result = await getTemplates();
      setTemplates(result.templates);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleCopy = useCallback((template: Template) => {
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    const text = template.content
      .replace(/\{date\}/g, dateStr)
      .replace(/\{time\}/g, timeStr)
      .replace(/\{datetime\}/g, `${dateStr} ${timeStr}`);

    navigator.clipboard.writeText(text).catch(() => {
      // fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    });
  }, []);

  const handleAdd = useCallback(async () => {
    try {
      const tmpl = await addTemplate('', '');
      setTemplates(prev => [...prev, tmpl]);
    } catch {
      // ignore
    }
  }, []);

  const handleUpdate = useCallback(async (id: number, title: string, content: string) => {
    try {
      await updateTemplate(id, title, content);
      setTemplates(prev =>
        prev.map(t => t.id === id ? { ...t, title, content } : t)
      );
    } catch {
      // ignore
    }
  }, []);

  const handleDelete = useCallback(async (id: number) => {
    setTemplates(prev => prev.filter(t => t.id !== id));
    try {
      await deleteTemplate(id);
    } catch {
      fetchTemplates(); // revert on failure
    }
  }, [fetchTemplates]);

  if (loading) {
    return <div className="p-4 text-center text-xs text-panel-muted">{t('card.loading')}</div>;
  }

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-2">
      {/* New template button */}
      <button
        onClick={handleAdd}
        className="w-full py-2 text-xs text-panel-accent border border-dashed border-panel-accent/40 rounded-lg hover:bg-panel-hover/50 transition-colors"
      >
        + {t('template.newTemplate')}
      </button>

      {templates.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-panel-muted">{t('template.emptyTitle')}</p>
          <p className="text-xs text-panel-muted/60 mt-1">{t('template.emptyHint')}</p>
        </div>
      ) : (
        templates.map(tmpl => (
          <TemplateCard
            key={tmpl.id}
            template={tmpl}
            onCopy={handleCopy}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
          />
        ))
      )}
    </div>
  );
}
