import React from 'react';

const FormError = ({ error }: { error?: string }) => {
  if (!error) return null;
  return <div className="text-red-500 text-sm mt-2">{error}</div>;
};

export default FormError; 