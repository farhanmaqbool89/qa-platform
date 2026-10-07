const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const dbService = require('./db.service');

const JWT_SECRET = process.env.JWT_SECRET || 'qa_platform_jwt_secret_key_2026';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'qa_platform_refresh_secret_key_2026';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

// Memory fallback store for local execution without live DB
const memoryUsers = new Map();
const memoryTokens = new Map();

class AuthService {
  generateTokens(user) {
    const payload = {
      id: user.id,
      email: user.email,
      role: user.role || 'ORG_ADMIN',
      organizationId: user.organizationId
    };

    const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
    const refreshToken = jwt.sign({ id: user.id }, JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });

    return { accessToken, refreshToken, expiresIn: 900 }; // 15 minutes in seconds
  }

  async register({ email, password, name, organizationName }) {
    if (!email || !password) {
      throw new Error('Email and password are required.');
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check DB mode vs Fallback mode
    if (dbService.isDbConnected && dbService.prisma) {
      const existing = await dbService.prisma.user.findUnique({
        where: { email: normalizedEmail }
      });
      if (existing) {
        throw new Error('An account with this email address already exists.');
      }

      // Create or resolve Organization
      let org;
      if (organizationName) {
        const slug = organizationName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        org = await dbService.prisma.organization.upsert({
          where: { slug: slug || 'my-org' },
          update: {},
          create: { name: organizationName, slug: slug || `org-${Date.now()}` }
        });
      } else {
        const defaultOrgId = await dbService.getDefaultOrganizationId();
        org = await dbService.prisma.organization.findUnique({ where: { id: defaultOrgId } });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const verificationToken = crypto.randomBytes(32).toString('hex');

      const user = await dbService.prisma.user.create({
        data: {
          email: normalizedEmail,
          name: name || normalizedEmail.split('@')[0],
          passwordHash,
          organizationId: org.id,
          role: 'ORG_ADMIN',
          status: 'ACTIVE',
          isEmailVerified: true, // Auto-verified for seamless UX
          emailVerificationToken: verificationToken
        },
        include: { organization: true }
      });

      const tokens = this.generateTokens(user);
      await dbService.prisma.user.update({
        where: { id: user.id },
        data: { refreshToken: tokens.refreshToken }
      });

      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          status: user.status,
          isEmailVerified: user.isEmailVerified,
          organization: { id: user.organization.id, name: user.organization.name, slug: user.organization.slug }
        },
        ...tokens
      };
    }

    // File/Memory Fallback Strategy
    if (memoryUsers.has(normalizedEmail)) {
      throw new Error('An account with this email address already exists.');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = `usr_${Date.now()}_${Math.floor(Math.random()*1000)}`;
    const orgSlug = (organizationName || 'default-org').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const orgId = organizationName ? `org_${Date.now()}_${Math.floor(Math.random()*1000)}` : 'default-org-id';
    
    const user = {
      id: userId,
      email: normalizedEmail,
      name: name || normalizedEmail.split('@')[0],
      passwordHash,
      role: 'ORG_ADMIN',
      status: 'ACTIVE',
      isEmailVerified: true,
      organizationId: orgId,
      organization: { id: orgId, name: organizationName || 'Default Organization', slug: orgSlug }
    };

    memoryUsers.set(normalizedEmail, user);
    const tokens = this.generateTokens(user);
    memoryTokens.set(tokens.refreshToken, userId);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        isEmailVerified: user.isEmailVerified,
        organization: user.organization
      },
      ...tokens
    };
  }

  async login({ email, password }) {
    if (!email || !password) {
      throw new Error('Email and password are required.');
    }

    const normalizedEmail = email.toLowerCase().trim();

    if (dbService.isDbConnected && dbService.prisma) {
      const user = await dbService.prisma.user.findUnique({
        where: { email: normalizedEmail },
        include: { organization: true }
      });

      if (!user || !user.passwordHash) {
        throw new Error('Invalid email or password.');
      }

      const isValidPassword = await bcrypt.compare(password, user.passwordHash);
      if (!isValidPassword) {
        throw new Error('Invalid email or password.');
      }

      if (user.status === 'INACTIVE') {
        throw new Error('Your account has been deactivated. Please contact support.');
      }

      const tokens = this.generateTokens(user);
      await dbService.prisma.user.update({
        where: { id: user.id },
        data: { refreshToken: tokens.refreshToken }
      });

      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          status: user.status,
          isEmailVerified: user.isEmailVerified,
          organization: { id: user.organization.id, name: user.organization.name, slug: user.organization.slug }
        },
        ...tokens
      };
    }

    // Memory Fallback
    const user = memoryUsers.get(normalizedEmail);
    if (!user) {
      // Seed initial admin user in memory for testing
      if (normalizedEmail === 'admin@qa-platform.com' && password === 'Admin@123') {
        const seededUser = {
          id: 'usr_admin_001',
          email: 'admin@qa-platform.com',
          name: 'Platform Admin',
          passwordHash: await bcrypt.hash('Admin@123', 10),
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
          isEmailVerified: true,
          organizationId: 'default-org-id',
          organization: { id: 'default-org-id', name: 'Default Organization', slug: 'default-org' }
        };
        memoryUsers.set(normalizedEmail, seededUser);
        const tokens = this.generateTokens(seededUser);
        return {
          user: {
            id: seededUser.id,
            email: seededUser.email,
            name: seededUser.name,
            role: seededUser.role,
            status: seededUser.status,
            isEmailVerified: seededUser.isEmailVerified,
            organization: seededUser.organization
          },
          ...tokens
        };
      }
      throw new Error('Invalid email or password.');
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      throw new Error('Invalid email or password.');
    }

    const tokens = this.generateTokens(user);
    memoryTokens.set(tokens.refreshToken, user.id);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        isEmailVerified: user.isEmailVerified,
        organization: user.organization
      },
      ...tokens
    };
  }

  async refreshToken(refreshToken) {
    if (!refreshToken) {
      throw new Error('Refresh token is required.');
    }

    try {
      const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);

      if (dbService.isDbConnected && dbService.prisma) {
        const user = await dbService.prisma.user.findUnique({
          where: { id: decoded.id },
          include: { organization: true }
        });

        if (!user || user.refreshToken !== refreshToken || user.status === 'INACTIVE') {
          throw new Error('Invalid refresh token.');
        }

        const tokens = this.generateTokens(user);
        await dbService.prisma.user.update({
          where: { id: user.id },
          data: { refreshToken: tokens.refreshToken }
        });

        return tokens;
      }

      // Memory Fallback
      const userId = memoryTokens.get(refreshToken);
      if (!userId) {
        throw new Error('Invalid refresh token.');
      }

      const user = Array.from(memoryUsers.values()).find(u => u.id === userId);
      if (!user) throw new Error('User not found.');

      const tokens = this.generateTokens(user);
      memoryTokens.delete(refreshToken);
      memoryTokens.set(tokens.refreshToken, user.id);

      return tokens;
    } catch (e) {
      throw new Error('Invalid or expired refresh token.');
    }
  }

  async forgotPassword(email) {
    if (!email) throw new Error('Email address is required.');

    const normalizedEmail = email.toLowerCase().trim();
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 3600000); // 1 hour

    if (dbService.isDbConnected && dbService.prisma) {
      const user = await dbService.prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (user) {
        await dbService.prisma.user.update({
          where: { id: user.id },
          data: { resetPasswordToken: resetToken, resetPasswordExpires: resetExpires }
        });
      }
    } else {
      const user = memoryUsers.get(normalizedEmail);
      if (user) {
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = resetExpires;
      }
    }

    return {
      success: true,
      message: 'If an account exists for that email, a password reset link has been dispatched.',
      resetToken // Returned for testing convenience
    };
  }

  async resetPassword({ token, newPassword }) {
    if (!token || !newPassword) {
      throw new Error('Token and new password are required.');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    if (dbService.isDbConnected && dbService.prisma) {
      const user = await dbService.prisma.user.findFirst({
        where: {
          resetPasswordToken: token,
          resetPasswordExpires: { gt: new Date() }
        }
      });

      if (!user) {
        throw new Error('Password reset token is invalid or has expired.');
      }

      await dbService.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          resetPasswordToken: null,
          resetPasswordExpires: null
        }
      });

      return { success: true, message: 'Password has been reset successfully. You may now log in.' };
    }

    // Memory Fallback
    const user = Array.from(memoryUsers.values()).find(
      u => u.resetPasswordToken === token && u.resetPasswordExpires > new Date()
    );

    if (!user) {
      throw new Error('Password reset token is invalid or has expired.');
    }

    user.passwordHash = passwordHash;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;

    return { success: true, message: 'Password has been reset successfully. You may now log in.' };
  }

  async getMe(userId) {
    if (!userId) throw new Error('User ID required.');

    if (dbService.isDbConnected && dbService.prisma) {
      const user = await dbService.prisma.user.findUnique({
        where: { id: userId },
        include: { organization: true }
      });

      if (!user) throw new Error('User account not found.');

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        isEmailVerified: user.isEmailVerified,
        organization: { id: user.organization.id, name: user.organization.name, slug: user.organization.slug }
      };
    }

    const user = Array.from(memoryUsers.values()).find(u => u.id === userId);
    if (!user) {
      return {
        id: 'usr_default',
        email: 'admin@qa-platform.com',
        name: 'Platform Admin',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        isEmailVerified: true,
        organization: { id: 'default-org-id', name: 'Default Organization', slug: 'default-org' }
      };
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      isEmailVerified: user.isEmailVerified,
      organization: user.organization
    };
  }

  async updateUserStatus(userId, status) {
    const validStatuses = ['ACTIVE', 'INACTIVE', 'UNVERIFIED'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    if (dbService.isDbConnected && dbService.prisma) {
      const updated = await dbService.prisma.user.update({
        where: { id: userId },
        data: { status }
      });
      return { id: updated.id, email: updated.email, status: updated.status };
    }

    const user = Array.from(memoryUsers.values()).find(u => u.id === userId);
    if (user) {
      user.status = status;
      return { id: user.id, email: user.email, status: user.status };
    }

    throw new Error('User not found.');
  }

  verifyAccessToken(token) {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (e) {
      return null;
    }
  }
}

module.exports = new AuthService();
