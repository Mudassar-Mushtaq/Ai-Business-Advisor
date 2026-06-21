import { useState, useRef, useEffect } from 'react';
import { X, Send, Bot, User, Loader, Sparkles } from 'lucide-react';
import { sendChatMessage } from '../../api';
import './Chatbot.css';

const WELCOME = {
  role: 'assistant',
  content: "👋 Hi! I'm your **AI Business Advisor**. I have access to your sales data, inventory levels, and forecasts.\n\nAsk me anything like:\n- *\"What's my best-selling product?\"*\n- *\"When should I restock my inventory?\"*\n- *\"Explain my sales forecast\"*"
};

function MessageBubble({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`chat-bubble-wrap ${isUser ? 'user' : 'assistant'}`}>
      <div className="chat-avatar">
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>
      <div className={`chat-bubble ${isUser ? 'user' : 'assistant'}`}>
        {msg.content.split('\n').map((line, i) => {
          // Simple markdown: **bold**, *italic*
          const formatted = line
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/`(.+?)`/g, '<code>$1</code>');
          return <p key={i} dangerouslySetInnerHTML={{ __html: formatted || '&nbsp;' }} />;
        })}
      </div>
    </div>
  );
}

export default function Chatbot({ open, onClose }) {
  const [messages, setMessages] = useState([WELCOME]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const apiMessages = [...messages, userMsg]
        .filter(m => m.role !== 'assistant' || m !== messages[0])
        .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

      const { reply } = await sendChatMessage(apiMessages);
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '⚠️ Failed to get a response. Please check your OpenAI API key or try again.'
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const suggestions = [
    "What's my top product?",
    "Are any items low on stock?",
    "Explain my forecast",
    "How can I boost sales?",
  ];

  return (
    <>
      <div className={`chatbot-overlay ${open ? 'visible' : ''}`} onClick={onClose} />
      <div className={`chatbot-panel ${open ? 'open' : ''}`}>
        {/* Header */}
        <div className="chatbot-header">
          <div className="chatbot-header-info">
            <div className="chatbot-avatar"><Bot size={18} /></div>
            <div>
              <h3>AI Business Advisor</h3>
              <span className="chatbot-status"><span className="pulse-dot" /> Online</span>
            </div>
          </div>
          <button className="chatbot-close" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Messages */}
        <div className="chatbot-messages">
          {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
          {loading && (
            <div className="chat-bubble-wrap assistant">
              <div className="chat-avatar"><Bot size={14} /></div>
              <div className="chat-bubble assistant typing">
                <span /><span /><span />
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Suggestions */}
        {messages.length <= 1 && (
          <div className="chatbot-suggestions">
            {suggestions.map(s => (
              <button key={s} className="suggestion-chip" onClick={() => { setInput(s); inputRef.current?.focus(); }}>
                <Sparkles size={12} /> {s}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="chatbot-input-area">
          <textarea
            ref={inputRef}
            className="chatbot-input"
            placeholder="Ask about sales, inventory, forecasts..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            rows={1}
          />
          <button className="chatbot-send" onClick={send} disabled={!input.trim() || loading}>
            {loading ? <Loader size={18} className="spin" /> : <Send size={18} />}
          </button>
        </div>
      </div>
    </>
  );
}
