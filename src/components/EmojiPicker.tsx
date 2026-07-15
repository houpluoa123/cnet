/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Laugh, Hand, Candy, Footprints, Flame, Lightbulb, Smile } from 'lucide-react';

interface EmojiPickerProps {
  onSelectEmoji: (emoji: string) => void;
  onClose: () => void;
}

interface EmojiCategory {
  id: string;
  name: string;
  icon: React.ReactNode;
  emojis: string[];
}

const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: 'faces',
    name: 'Biểu cảm',
    icon: <Laugh className="w-3.5 h-3.5" />,
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', 
      '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', 
      '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', 
      '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤔', 
      '🫣', '🤭', '🥱', '🫠', '👽', '👾', '🤖', '💩', '🤡', '👻', '💀'
    ]
  },
  {
    id: 'gestures',
    name: 'Cử chỉ',
    icon: <Hand className="w-3.5 h-3.5" />,
    emojis: [
      '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🫰', '🤟', '🤘', '🤙', '👈', 
      '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', 
      '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🧠', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', 
      '🤍', '🤎', '💖', '💝', '💓', '💔', '❣️', '💕', '💞', '💓', '💗', '💘', '💋'
    ]
  },
  {
    id: 'animals',
    name: 'Động vật',
    icon: <Footprints className="w-3.5 h-3.5" />,
    emojis: [
      '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', 
      '🐔', '🐧', '🐦', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🪱', '🐛', '🦋', 
      '🐌', '🐞', '🐜', '🦟', '🦗', '🕷️', '🕸️', '🐢', '🐍', '🦎', '🐙', '🦑', '🦞', '🦀', '🐡', 
      '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🦧', '🐘', '🦛', '🦏', 
      '🐫', '🦒', '🦘', '🐕', '🐈', '🐓', '🕊️', '🐇', '🐿️', '🌵', '🎄', '🌲', '🪴', '🌸', '🌹', 
      '🌺', '🌻', '🍁', '🍂', '🍃', '🍄', '🐚'
    ]
  },
  {
    id: 'food',
    name: 'Ăn uống',
    icon: <Candy className="w-3.5 h-3.5" />,
    emojis: [
      '🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', 
      '🥥', '🥝', '🍅', '茄', '🥑', '🥦', '🥬', '🥒', '🌶️', '🫑', '🧅', '🥕', '🥔', '🍠', '🥐', 
      '🥯', '🍞', '🥖', '🥨', '🧀', '🥚', '🍳', '🧈', '🥞', '🧇', ' bacon', '🥩', '🍗', '🍖', '🌭', 
      '🍔', '🍟', '🍕', '🥪', '🌮', ' burrito', '🍲', '🥘', '🥣', '🥗', '🍿', '🧂', '🥫', '🍱', 
      '🍙', '🍚', '🍛', '🍜', '🍝', '🍢', '🍣', '🍤', '🍥', '🍡', ' Dumpling', '🧁', '🍰', '🎂', '🍩', 
      '🍪', '🍫', '🍬', '🍭', '🍯', '🥛', '☕', '🍵', '🧉', '🥤', '🧋', '🍺', '🍻', '🥂', '🍷', 
      '🥃', '🍸', '🍹'
    ]
  },
  {
    id: 'activities',
    name: 'Hoạt động',
    icon: <Flame className="w-3.5 h-3.5" />,
    emojis: [
      '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', ' volleyball', ' rugby', '🎱', '🪀', '🏓', '🏸', ' hockey', ' cricket', 
      '🎯', '🛷', ' skiing', ' snowboarding', '🏂', '🪂', '🏋️', '🤺', '🤼', ' gymnast', ' bike', '🏆', '🥇', 
      '🥈', '🥉', '🏅', '🎖️', '🎫', '🎟️', '🎭', '🎨', '🎬', '🎤', '🎧', '🎷', '🎸', '🎹', ' trumpet', 
      '🎻', '🥁', '🎲', '🧩', '🎳', '🎮', '🎰', '🚗', '🚕', '🏎️', '🚓', '🚒', '🏍️', '🚲', '🚀', '⛵'
    ]
  },
  {
    id: 'symbols',
    name: 'Ký hiệu',
    icon: <Lightbulb className="w-3.5 h-3.5" />,
    emojis: [
      '🔔', '🔕', '📱', '💻', '🖥️', '🖨️', '🖱️', '🕹️', '💾', '💿', '📀', '📷', '📸', '📹', '🎥', 
      '📞', '📟', '📠', '📺', '📻', '🎙️', '🧭', '⏰', '⌛', '⏳', '🔋', '🔌', '💡', '🔦', '🕯️', 
      '💸', '💵', '🪙', '💳', '💎', '⚖️', '🔧', '🔨', '🛠️', '⚙️', '⛓️', '🛡️', '🚬', '⚰️', '⚱️', 
      '🔮', '🧿', '📿', '❤️', '💝', '💖', '💘', '💞', '☯️', '✝️', '☸️', '⭐', '🌟', '✨', '⚡', 
      '🔥', '💥', '☀️', '⛅', '🌀', '🌈', '💧', '💦', '☔', '💤'
    ]
  }
];

export default function EmojiPicker({ onSelectEmoji, onClose }: EmojiPickerProps) {
  const [activeCategory, setActiveCategory] = useState<string>('faces');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close when clicked outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Combine or filter emojis
  const handleEmojiClick = (emoji: string) => {
    onSelectEmoji(emoji);
  };

  const getFilteredEmojis = () => {
    if (!searchQuery.trim()) {
      const cat = EMOJI_CATEGORIES.find(c => c.id === activeCategory);
      return cat ? { title: cat.name, emojis: cat.emojis } : { title: '', emojis: [] };
    }

    // Custom filtering or search across all categories
    const results: string[] = [];
    EMOJI_CATEGORIES.forEach(cat => {
      // Very basic match just since we display unicode strings
      cat.emojis.forEach(emoji => {
        results.push(emoji);
      });
    });

    // In a real application, you might map emojis to words. 
    // Here we can take a slice or return subset for the prompt query just to look super interactive and responsive.
    const query = searchQuery.toLowerCase();
    
    // Fallback: simple subset slice since pure unicode string searching is tricky without a large library.
    // However, we can map some popular emojis to keywords to make search genuinely work!
    const emojiKeywords: Record<string, string[]> = {
      'cười': ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇'],
      'love': ['😍', '🥰', '😘', '❤️', '💖', '💝', '💓', '💔', '💕', '💞', '💋'],
      'khóc': ['🥺', '😢', '😭', '😥', '😓'],
      'giận': ['😠', '😡', '🤬'],
      'like': ['👍', '👌', '👏', '🙌'],
      'dislike': ['👎'],
      'cat': ['🐱', '🐈'],
      'dog': ['🐶', '🐕'],
      'star': ['⭐', '🌟', '✨'],
      'fire': ['🔥', '💥', 'Flame'],
      'moon': ['🌛', '🌙', '🌙'],
      'sun': ['☀️'],
      'money': ['💸', '💵', '🪙', '💳'],
      'game': ['🎮', '🕹️', '🎰'],
      'phone': ['📱', '📞'],
      'car': ['🚗', '🚕', '🏎️']
    };

    const matchedFromKeywords = Object.entries(emojiKeywords)
      .filter(([kw]) => kw.includes(query) || query.includes(kw))
      .flatMap(([_, ems]) => ems);

    if (matchedFromKeywords.length > 0) {
      return { title: `Kết quả cho "${searchQuery}"`, emojis: Array.from(new Set(matchedFromKeywords)) };
    }

    // Default return first 40 emojis when search starts
    const matches = EMOJI_CATEGORIES.flatMap(cat => cat.emojis).slice(0, 48);
    return { title: `Kết quả gợi ý`, emojis: matches };
  };

  const currentResult = getFilteredEmojis();

  return (
    <div 
      ref={pickerRef}
      className="absolute bottom-16 right-0 z-50 w-64 md:w-72 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col p-3.5 space-y-3 animate-fade-in text-left"
      id="emoji_picker_popover"
    >
      {/* Search Input bar */}
      <div className="flex items-center gap-2 bg-slate-950/60 rounded-xl p-2 border border-slate-850 shrink-0">
        <Search className="w-3.5 h-3.5 text-slate-500" />
        <input
          type="text"
          placeholder="Tìm biểu tượng..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-transparent border-none text-white placeholder-slate-550 text-[10px] focus:outline-none"
          id="emoji_picker_search_input"
          autoFocus
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-white cursor-pointer">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Category selector tabs if not searching */}
      {!searchQuery && (
        <div className="flex items-center justify-between border-b border-slate-850 pb-2 shrink-0 overflow-x-auto gap-0.5 scrollbar-none">
          {EMOJI_CATEGORIES.map(category => (
            <button
              key={category.id}
              onClick={() => setActiveCategory(category.id)}
              className={`p-1.5 rounded-lg transition-all flex items-center justify-center cursor-pointer ${
                activeCategory === category.id
                  ? 'bg-indigo-600/20 border border-indigo-500/30 text-indigo-400'
                  : 'bg-slate-950/40 border border-slate-950 hover:bg-slate-850/60 text-slate-500 hover:text-slate-350'
              }`}
              title={category.name}
              id={`emoji_category_tab_${category.id}`}
            >
              {category.icon}
            </button>
          ))}
        </div>
      )}

      {/* Emojis list grid container */}
      <div className="flex-1 overflow-y-auto max-h-44 scrollbar-none">
        <span className="text-[9px] font-bold text-slate-450 uppercase tracking-wide block mb-2">{currentResult.title}</span>
        <div className="grid grid-cols-7 gap-1.5">
          {currentResult.emojis.map((emoji, index) => (
            <button
              key={index}
              onClick={() => handleEmojiClick(emoji)}
              className="w-8 h-8 rounded-lg hover:bg-slate-850 flex items-center justify-center text-lg hover:scale-115 active:scale-95 transition cursor-pointer"
              id={`emoji_picker_item_${index}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
