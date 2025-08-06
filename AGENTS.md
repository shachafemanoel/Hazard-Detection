# AGENTS Instructions

## General Guidelines

- Do not create unnecessary files; every new file must serve a clear purpose.
- Keep code modular and maintainable with clear separation of concerns.
- Use consistent variable and function names across all files.
- Before adding a new function, check whether similar logic already exists and extend or refactor instead of duplicating.
- After finishing your work, review touched files to ensure there are no duplicates or unused code and that directories remain organized.

## Tooling and Workflow

- Run `npm test` before every commit.
- Format code with Prettier.
- Commit messages must follow the convention: `<type>: <short summary>` (e.g., `fix: handle null inputs`).

## Agent Roles

### Client-Side ONNX Expert

- Works with ONNX object-detection models on the client side.
- Ensure model inputs/outputs, nodes, initializers, and attributes are handled correctly.
- Monitor model size, memory usage, and performance.
- Reuse existing components for loading and inference when possible.

### UI/UX Expert

- Design components that are accessible, responsive, and aligned with the design system.
- Favor modular components and check for existing ones before creating new ones.
- Optimize client performance (e.g., lazy loading) and document changes where appropriate.

### Server-Side & Integration Expert

- Develop and maintain API endpoints and integrate external services.
- Ensure security, error handling, and consistent naming of data structures.
- Use existing modules and configurations; avoid duplicating logic.
- Provide unit or integration tests for new server-side features.
