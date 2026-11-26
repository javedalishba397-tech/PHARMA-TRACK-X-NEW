// Shared form field components
export function FormField({ label, error, required, children }) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-sm font-medium text-gray-700">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function Input({ error, className = '', ...props }) {
  return (
    <input
      className={`w-full px-3 py-2 text-sm border rounded-lg outline-none transition-fast
        ${error ? 'border-red-400 focus:ring-2 focus:ring-red-200' : 'border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'}
        disabled:bg-gray-50 disabled:text-gray-500 ${className}`}
      {...props}
    />
  );
}

export function Select({ error, className = '', children, ...props }) {
  return (
    <select
      className={`w-full px-3 py-2 text-sm border rounded-lg outline-none transition-fast bg-white
        ${error ? 'border-red-400 focus:ring-2 focus:ring-red-200' : 'border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'}
        disabled:bg-gray-50 ${className}`}
      {...props}>
      {children}
    </select>
  );
}

export function Textarea({ error, className = '', ...props }) {
  return (
    <textarea
      rows={3}
      className={`w-full px-3 py-2 text-sm border rounded-lg outline-none transition-fast resize-none
        ${error ? 'border-red-400' : 'border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'}
        ${className}`}
      {...props}
    />
  );
}

export function Btn({ variant = 'primary', size = 'md', className = '', children, ...props }) {
  const variants = {
    primary:   'bg-blue-600 hover:bg-blue-700 text-white',
    danger:    'bg-red-600 hover:bg-red-700 text-white',
    success:   'bg-green-600 hover:bg-green-700 text-white',
    secondary: 'bg-white border border-gray-300 hover:bg-gray-50 text-gray-700',
    ghost:     'hover:bg-gray-100 text-gray-700',
    warning:   'bg-amber-500 hover:bg-amber-600 text-white',
  };
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-5 py-2.5 text-base' };
  return (
    <button
      className={`inline-flex items-center gap-2 font-medium rounded-lg transition-fast disabled:opacity-50 disabled:cursor-not-allowed
        ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}>
      {children}
    </button>
  );
}

export function formatErrorMessage(err) {
  if (!err) return '';
  if (typeof err === 'string') return err;
  if (Array.isArray(err)) {
    return err
      .map(item => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          const field = Array.isArray(item.loc) ? item.loc[item.loc.length - 1] : '';
          const msg = item.msg || JSON.stringify(item);
          return field && field !== '__root__' ? `${field}: ${msg}` : msg;
        }
        return String(item);
      })
      .join('; ');
  }
  if (typeof err === 'object') {
    if (err.detail) return formatErrorMessage(err.detail);
    if (err.message) return formatErrorMessage(err.message);
    return Object.entries(err)
      .map(([k, v]) => `${k}: ${v}`)
      .join('; ');
  }
  return String(err);
}

export function ErrorAlert({ message }) {
  if (!message) return null;
  const formatted = formatErrorMessage(message);
  if (!formatted) return null;
  return (
    <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
      {formatted}
    </div>
  );
}
