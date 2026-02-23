import { Role } from '../constants';

export const hasAccess = (
  userRoles: Role[] = [],
  allowedRoles: Role[] = [],
  and = false,
): boolean => {
  // Admin superuser: always has access to everything
  if (userRoles.some(role => role === Role.ADMIN)) return true;

  const condition = (allowedRole: Role) => {
    return userRoles.some(userRole => userRole === allowedRole);
  };

  return and ? allowedRoles.every(condition) : allowedRoles.some(condition);
};
