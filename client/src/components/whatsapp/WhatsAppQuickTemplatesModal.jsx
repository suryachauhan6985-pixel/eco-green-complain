import React, { useState } from 'react';
import { Search, Sparkles, X, Check, Copy } from 'lucide-react';
import { ModalWrapper } from '../common/ModalWrapper';
import { ESCAPE_PRIORITY } from '../../utils/escapeManager';

export const DEFAULT_WHATSAPP_TEMPLATES = [
  {
    id: 'greeting',
    command: '/greeting',
    title: 'Customer Greeting',
    category: 'General',
    text: 'Hello! Thank you for contacting Eco Green Solar customer support. How can we assist you today?'
  },
  {
    id: 'status',
    command: '/status',
    title: 'Service Status Update',
    category: 'Service',
    text: 'Your solar system service ticket is currently in progress. Our technical team is reviewing your diagnostics and will update you shortly.'
  },
  {
    id: 'technician',
    command: '/technician',
    title: 'Technician Dispatched',
    category: 'Dispatch',
    text: 'A certified Eco Green field engineer has been assigned to your service request and will contact you before arriving on site.'
  },
  {
    id: 'inverter',
    command: '/inverter',
    title: 'Inverter Diagnostics Request',
    category: 'Technical',
    text: 'Please check your solar inverter display lights (Green = Normal, Red = Fault) and share a quick photo of the display screen with us.'
  },
  {
    id: 'resolved',
    command: '/resolved',
    title: 'Complaint Resolved',
    category: 'Resolution',
    text: 'Your solar service issue has been marked resolved. If you need any further assistance, feel free to reply directly to this chat.'
  },
  {
    id: 'cleaning',
    command: '/cleaning',
    title: 'Solar Panel Maintenance Tips',
    category: 'Tips',
    text: 'For optimal solar generation, clean the panels early in the morning with plain water and a soft wiper. Avoid abrasive detergents.'
  },
  {
    id: 'docs',
    command: '/docs',
    title: 'Electricity Bill & Warranty Request',
    category: 'Documentation',
    text: 'Please share a clear photo of your latest electricity bill and solar installation certificate so our team can verify grid sync records.'
  }
];

export function WhatsAppQuickTemplatesModal({ isOpen, onClose, onSelectTemplate }) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  const categories = ['All', 'General', 'Service', 'Dispatch', 'Technical', 'Resolution', 'Documentation'];

  const filtered = DEFAULT_WHATSAPP_TEMPLATES.filter((tpl) => {
    const matchesCategory = selectedCategory === 'All' || tpl.category === selectedCategory;
    const q = search.toLowerCase().trim();
    const matchesSearch = !q || (
      tpl.title.toLowerCase().includes(q) ||
      tpl.command.toLowerCase().includes(q) ||
      tpl.text.toLowerCase().includes(q)
    );
    return matchesCategory && matchesSearch;
  });

  return (
    <ModalWrapper
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-lg"
      priority={ESCAPE_PRIORITY.DRAWER}
      ariaLabel="Quick Reply Templates"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full overflow-hidden border border-slate-200 flex flex-col max-h-[85vh]"
      >
        {/* Header */}
        <div className="px-5 py-3.5 bg-[#008069] text-white flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-300" />
            <div>
              <h3 className="font-bold text-sm">Quick Reply Templates</h3>
              <p className="text-[11px] text-white/80">Enterprise canned messages for customer service</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded-full cursor-pointer text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Filter Bar */}
        <div className="p-3.5 border-b border-slate-200 bg-slate-50 space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search canned templates (e.g. /status, inverter, greeting)..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-[#008069]"
              autoFocus
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer shrink-0 text-[11px] ${
                  selectedCategory === cat
                    ? 'bg-[#008069] text-white shadow-2xs'
                    : 'bg-white hover:bg-slate-200 text-slate-600 border border-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Templates List */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5 bg-[#f0f2f5]">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              No matching templates found for "{search}".
            </div>
          ) : (
            filtered.map((tpl) => (
              <div
                key={tpl.id}
                onClick={() => {
                  onSelectTemplate(tpl.text);
                  onClose();
                }}
                className="p-3 bg-white rounded-xl border border-slate-200 hover:border-[#008069] shadow-2xs hover:shadow-xs transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-slate-900 group-hover:text-[#008069] transition-colors">
                      {tpl.title}
                    </span>
                    <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-mono text-[10px] font-bold">
                      {tpl.command}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[10px] font-bold border border-emerald-200">
                    {tpl.category}
                  </span>
                </div>
                <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                  {tpl.text}
                </p>
                <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                  <span className="text-[#008069] font-bold group-hover:underline flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" />
                    Insert Template
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (navigator.clipboard) {
                        navigator.clipboard.writeText(tpl.text);
                      }
                    }}
                    className="text-slate-400 hover:text-slate-700 flex items-center gap-1 p-1"
                    title="Copy to clipboard"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </ModalWrapper>
  );
}
