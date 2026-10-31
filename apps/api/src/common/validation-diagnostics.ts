import { ValidationPipe, type ValidationError } from '@nestjs/common';

/** Retain Nest's public validation contract, logging rules/field paths, never values. */
export function diagnosticValidationFactory() {
  const standard = new ValidationPipe().createExceptionFactory();
  return (errors: ValidationError[]) => {
    const exception = standard(errors);
    const validation: Array<{ field: string; rules: string[] }> = [];
    let visited = 0;
    const visit = (nodes: ValidationError[], prefix = '', depth = 0) => {
      if (depth > 5) return;
      for (const node of nodes.slice(0, 16)) {
        if (validation.length >= 16 || ++visited > 128) return;
        const rules = Object.keys(node.constraints ?? {}).filter((rule) =>
          /^[a-zA-Z]{1,40}$/u.test(rule),
        );
        const property =
          !rules.includes('whitelistValidation') &&
          /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$|^\d{1,4}$/u.test(node.property)
            ? node.property
            : '[unknown-field]';
        const field = prefix ? `${prefix}.${property}` : property;
        if (rules.length) validation.push({ field, rules });
        if (node.children) visit(node.children, field, depth + 1);
      }
    };
    visit(errors);
    Object.defineProperty(exception, 'diagnosticValidation', { value: validation });
    return exception;
  };
}
