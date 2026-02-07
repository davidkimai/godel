/**
 * SAML Authentication Module
 * 
 * Provides SAML 2.0 integration for enterprise SSO.
 * Supports Identity Provider (IdP) initiated and Service Provider (SP) initiated flows.
 */

import { EventEmitter } from 'events';
import { createHash, randomBytes, sign, createPrivateKey } from 'crypto';
import { promisify } from 'util';
import { deflateRaw, inflateRaw } from 'zlib';

const deflateRawAsync = promisify(deflateRaw);
const inflateRawAsync = promisify(inflateRaw);

// Types
export interface SAMLConfig {
  // Service Provider settings
  issuer: string;
  callbackUrl: string;
  entryPoint?: string;
  logoutUrl?: string;
  
  // Certificate and keys
  cert?: string; // IdP certificate (PEM)
  privateKey?: string; // SP private key (PEM)
  decryptionPvk?: string; // SP private key for decryption
  
  // Signature settings
  signatureAlgorithm?: 'sha256' | 'sha512';
  digestAlgorithm?: 'sha256' | 'sha512';
  
  // Request/Response settings
  identifierFormat?: string;
  acceptedClockSkewMs?: number;
  requestIdExpirationPeriodMs?: number;
  
  // Security settings
  wantAssertionsSigned?: boolean;
  wantResponseSigned?: boolean;
  disableRequestedAuthnContext?: boolean;
}

export interface SAMLUser {
  id: string;
  email?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  groups?: string[];
  sessionIndex?: string;
  nameID?: string;
  nameIDFormat?: string;
  attributes: Record<string, unknown>;
}

export interface SAMLAuthResult {
  success: boolean;
  user?: SAMLUser;
  error?: string;
  relayState?: string;
}

export interface SAMLRequest {
  id: string;
  issueInstant: string;
  destination?: string;
  issuer: string;
  assertionConsumerServiceURL: string;
}

export interface SAMLResponse {
  id: string;
  inResponseTo?: string;
  issueInstant: string;
  issuer: string;
  assertions: SAMLAssertion[];
  signature?: string;
}

export interface SAMLAssertion {
  id: string;
  issueInstant: string;
  issuer: string;
  subject: {
    nameID: string;
    nameIDFormat: string;
    confirmationMethod: string;
    notOnOrAfter: string;
  };
  conditions: {
    notBefore: string;
    notOnOrAfter: string;
    audience: string;
  };
  attributes: Record<string, unknown>;
  authnStatement?: {
    authnInstant: string;
    sessionIndex: string;
    authnContextClassRef: string;
  };
}

/**
 * SAML Authentication Provider
 */
export class SAMLAuthProvider extends EventEmitter {
  private config: SAMLConfig;
  private requestStore: Map<string, { timestamp: number; relayState?: string }> = new Map();

  constructor(config: SAMLConfig) {
    super();
    this.config = {
      signatureAlgorithm: 'sha256',
      digestAlgorithm: 'sha256',
      identifierFormat: 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent',
      acceptedClockSkewMs: 60000,
      requestIdExpirationPeriodMs: 28800000, // 8 hours
      wantAssertionsSigned: true,
      wantResponseSigned: true,
      disableRequestedAuthnContext: false,
      ...config,
    };
    
    // Start cleanup interval
    this.startCleanupInterval();
  }

  /**
   * Generate SAML AuthnRequest for SP-initiated SSO
   */
  async generateAuthRequest(relayState?: string): Promise<{ request: string; id: string; url: string }> {
    const id = `_${this.generateID()}`;
    const issueInstant = this.generateTimestamp();
    
    // Store request for validation later
    this.requestStore.set(id, {
      timestamp: Date.now(),
      relayState,
    });

    const authnRequestXML = this.buildAuthnRequestXML(id, issueInstant);
    
    // Compress and encode
    const compressed = await deflateRawAsync(Buffer.from(authnRequestXML));
    const base64Request = compressed.toString('base64');
    const urlEncoded = encodeURIComponent(base64Request);
    
    const entryPoint = this.config.entryPoint || '';
    const redirectUrl = `${entryPoint}?SAMLRequest=${urlEncoded}${relayState ? `&RelayState=${encodeURIComponent(relayState)}` : ''}`;

    this.emit('request:created', { id, relayState });

    return {
      request: base64Request,
      id,
      url: redirectUrl,
    };
  }

  /**
   * Process SAML Response from IdP
   */
  async processResponse(encodedResponse: string, relayState?: string): Promise<SAMLAuthResult> {
    const traceId = randomBytes(8).toString('hex');
    
    try {
      this.emit('response:received', { traceId, hasRelayState: !!relayState });

      // Decode response
      const responseXML = Buffer.from(encodedResponse, 'base64').toString('utf8');
      
      // Parse response
      const response = this.parseSAMLResponse(responseXML);
      
      // Validate response
      const validation = this.validateResponse(response);
      if (!validation.valid) {
        this.emit('response:invalid', { traceId, reason: validation.error });
        return { success: false, error: validation.error };
      }

      // Check InResponseTo if present
      if (response.inResponseTo) {
        const requestInfo = this.requestStore.get(response.inResponseTo);
        if (!requestInfo) {
          this.emit('response:invalid', { traceId, reason: 'unknown_request_id' });
          return { success: false, error: 'Invalid or expired authentication request' };
        }
        
        // Clean up used request
        this.requestStore.delete(response.inResponseTo);
      }

      // Extract user from assertion
      const user = this.extractUserFromAssertion(response.assertions[0]);
      
      if (!user) {
        this.emit('response:invalid', { traceId, reason: 'no_user_in_assertion' });
        return { success: false, error: 'No user information in SAML assertion' };
      }

      this.emit('auth:success', { 
        traceId, 
        userId: user.id,
        email: user.email,
      });

      return {
        success: true,
        user,
        relayState,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'SAML processing failed';
      this.emit('auth:error', { traceId, error: errorMessage });
      return { success: false, error: 'Authentication failed' };
    }
  }

  /**
   * Generate logout request
   */
  async generateLogoutRequest(user: SAMLUser): Promise<{ request: string; url: string }> {
    const id = `_${this.generateID()}`;
    const issueInstant = this.generateTimestamp();
    
    const logoutRequestXML = this.buildLogoutRequestXML(id, issueInstant, user);
    
    const compressed = await deflateRawAsync(Buffer.from(logoutRequestXML));
    const base64Request = compressed.toString('base64');
    const urlEncoded = encodeURIComponent(base64Request);
    
    const logoutUrl = this.config.logoutUrl || this.config.entryPoint || '';
    const redirectUrl = `${logoutUrl}?SAMLRequest=${urlEncoded}`;

    return {
      request: base64Request,
      url: redirectUrl,
    };
  }

  /**
   * Process logout response
   */
  async processLogoutResponse(encodedResponse: string): Promise<{ success: boolean; error?: string }> {
    try {
      const responseXML = Buffer.from(encodedResponse, 'base64').toString('utf8');
      
      // Simple validation - in production, parse and validate properly
      if (!responseXML.includes('LogoutResponse')) {
        return { success: false, error: 'Invalid logout response' };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: 'Logout processing failed' };
    }
  }

  /**
   * Get SAML metadata for SP configuration
   */
  generateServiceProviderMetadata(): string {
    const cert = this.config.cert || '';
    const certLines = cert
      .replace('-----BEGIN CERTIFICATE-----', '')
      .replace('-----END CERTIFICATE-----', '')
      .replace(/\s/g, '');

    return `<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${this.config.issuer}">
  <SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <NameIDFormat>${this.config.identifierFormat}</NameIDFormat>
    <AssertionConsumerService index="0" isDefault="true" 
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" 
      Location="${this.config.callbackUrl}"/>
    ${cert ? `<KeyDescriptor use="signing">
      <KeyInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
        <X509Data>
          <X509Certificate>${certLines}</X509Certificate>
        </X509Data>
      </KeyInfo>
    </KeyDescriptor>` : ''}
  </SPSSODescriptor>
</EntityDescriptor>`;
  }

  /**
   * Build AuthnRequest XML
   */
  private buildAuthnRequestXML(id: string, issueInstant: string): string {
    const authnContextClassRef = this.config.disableRequestedAuthnContext 
      ? '' 
      : `<samlp:RequestedAuthnContext Comparison="exact">
      <saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef>
    </samlp:RequestedAuthnContext>`;

    return `<?xml version="1.0"?>
<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
                    xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
                    ID="${id}"
                    Version="2.0"
                    IssueInstant="${issueInstant}"
                    Destination="${this.config.entryPoint || ''}"
                    AssertionConsumerServiceURL="${this.config.callbackUrl}"
                    ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">
  <saml:Issuer>${this.config.issuer}</saml:Issuer>
  ${authnContextClassRef}
</samlp:AuthnRequest>`;
  }

  /**
   * Build LogoutRequest XML
   */
  private buildLogoutRequestXML(id: string, issueInstant: string, user: SAMLUser): string {
    return `<?xml version="1.0"?>
<samlp:LogoutRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
                     xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
                     ID="${id}"
                     Version="2.0"
                     IssueInstant="${issueInstant}"
                     Destination="${this.config.logoutUrl || ''}">
  <saml:Issuer>${this.config.issuer}</saml:Issuer>
  <saml:NameID Format="${user.nameIDFormat || this.config.identifierFormat}">${user.nameID || user.id}</saml:NameID>
  ${user.sessionIndex ? `<samlp:SessionIndex>${user.sessionIndex}</samlp:SessionIndex>` : ''}
</samlp:LogoutRequest>`;
  }

  /**
   * Parse SAML Response XML
   */
  private parseSAMLResponse(xml: string): SAMLResponse {
    // Simplified parsing - in production, use a proper XML parser
    const id = this.extractXMLAttribute(xml, 'Response', 'ID') || `_${this.generateID()}`;
    const inResponseTo = this.extractXMLAttribute(xml, 'Response', 'InResponseTo') || undefined;
    const issueInstant = this.extractXMLAttribute(xml, 'Response', 'IssueInstant') || this.generateTimestamp();
    const issuer = this.extractXMLValue(xml, 'Issuer') || '';

    // Parse assertions
    const assertions: SAMLAssertion[] = [];
    const assertionMatch = xml.match(/<saml:Assertion[\s\S]*?<\/saml:Assertion>/g);
    
    if (assertionMatch) {
      for (const assertionXML of assertionMatch) {
        const assertion = this.parseAssertion(assertionXML);
        if (assertion) assertions.push(assertion);
      }
    }

    return {
      id,
      inResponseTo,
      issueInstant,
      issuer,
      assertions,
    };
  }

  /**
   * Parse SAML Assertion
   */
  private parseAssertion(xml: string): SAMLAssertion | null {
    try {
      const id = this.extractXMLAttribute(xml, 'Assertion', 'ID') || `_${this.generateID()}`;
      const issueInstant = this.extractXMLAttribute(xml, 'Assertion', 'IssueInstant') || this.generateTimestamp();
      const issuer = this.extractXMLValue(xml, 'Issuer') || '';
      
      // Extract NameID
      const nameID = this.extractXMLValue(xml, 'NameID') || '';
      const nameIDFormat = this.extractXMLAttribute(xml, 'NameID', 'Format') || this.config.identifierFormat || '';
      
      // Extract conditions
      const notBefore = this.extractXMLAttribute(xml, 'Conditions', 'NotBefore') || '';
      const notOnOrAfter = this.extractXMLAttribute(xml, 'Conditions', 'NotOnOrAfter') || '';
      const audience = this.extractXMLValue(xml, 'Audience') || '';

      // Extract attributes
      const attributes: Record<string, unknown> = {};
      const attrMatches = xml.matchAll(/<saml:Attribute Name="([^"]+)"[\s\S]*?<\/saml:Attribute>/g);
      for (const match of attrMatches) {
        const attrName = match[1];
        const attrValues = match[0].match(/<saml:AttributeValue[^>]*>([^<]*)<\/saml:AttributeValue>/g);
        if (attrValues) {
          const values = attrValues.map(v => v.replace(/<[^>]+>/g, ''));
          attributes[attrName] = values.length === 1 ? values[0] : values;
        }
      }

      // Extract session index
      const sessionIndex = this.extractXMLAttribute(xml, 'AuthnStatement', 'SessionIndex') || '';
      const authnInstant = this.extractXMLAttribute(xml, 'AuthnStatement', 'AuthnInstant') || '';
      const authnContextClassRef = this.extractXMLValue(xml, 'AuthnContextClassRef') || '';

      return {
        id,
        issueInstant,
        issuer,
        subject: {
          nameID,
          nameIDFormat,
          confirmationMethod: 'urn:oasis:names:tc:SAML:2.0:cm:bearer',
          notOnOrAfter,
        },
        conditions: {
          notBefore,
          notOnOrAfter,
          audience,
        },
        attributes,
        authnStatement: sessionIndex ? {
          authnInstant,
          sessionIndex,
          authnContextClassRef,
        } : undefined,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract user from assertion
   */
  private extractUserFromAssertion(assertion: SAMLAssertion): SAMLUser | null {
    if (!assertion) return null;

    const attrs = assertion.attributes;
    
    // Extract groups if present
    let groups: string[] | undefined;
    const groupAttr = attrs['http://schemas.xmlsoap.org/claims/Group'] || 
                      attrs['groups'] || 
                      attrs['Group'];
    if (groupAttr) {
      groups = Array.isArray(groupAttr) ? groupAttr : [String(groupAttr)];
    }

    return {
      id: assertion.subject.nameID || 
          String(attrs['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier'] || 
                attrs['uid'] || 
                attrs['email'] || 
                ''),
      email: String(attrs['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'] || 
                 attrs['email'] || 
                 attrs['Email'] || 
                 ''),
      name: String(attrs['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] || 
                attrs['displayName'] || 
                attrs['name'] || 
                ''),
      firstName: String(attrs['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname'] || 
                      attrs['firstName'] || 
                      attrs['givenName'] || 
                      ''),
      lastName: String(attrs['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname'] || 
                     attrs['lastName'] || 
                     attrs['sn'] || 
                     ''),
      groups,
      sessionIndex: assertion.authnStatement?.sessionIndex,
      nameID: assertion.subject.nameID,
      nameIDFormat: assertion.subject.nameIDFormat,
      attributes: attrs,
    };
  }

  /**
   * Validate SAML Response
   */
  private validateResponse(response: SAMLResponse): { valid: boolean; error?: string } {
    const skew = this.config.acceptedClockSkewMs || 60000;
    const now = Date.now();

    for (const assertion of response.assertions) {
      // Check conditions
      if (assertion.conditions.notBefore) {
        const notBefore = new Date(assertion.conditions.notBefore).getTime();
        if (now < notBefore - skew) {
          return { valid: false, error: 'Assertion is not yet valid' };
        }
      }

      if (assertion.conditions.notOnOrAfter) {
        const notOnOrAfter = new Date(assertion.conditions.notOnOrAfter).getTime();
        if (now > notOnOrAfter + skew) {
          return { valid: false, error: 'Assertion has expired' };
        }
      }

      // Validate audience
      if (assertion.conditions.audience && assertion.conditions.audience !== this.config.issuer) {
        return { valid: false, error: 'Invalid audience' };
      }
    }

    return { valid: true };
  }

  /**
   * Extract XML attribute value
   */
  private extractXMLAttribute(xml: string, element: string, attribute: string): string | null {
    const regex = new RegExp(`<[^>]*?:?${element}[^>]*?${attribute}="([^"]*)"`, 'i');
    const match = xml.match(regex);
    return match ? match[1] : null;
  }

  /**
   * Extract XML element value
   */
  private extractXMLValue(xml: string, element: string): string | null {
    const regex = new RegExp(`<[^>]*?:?${element}[^>]*>([^<]*)</[^>]*?:?${element}>`, 'i');
    const match = xml.match(regex);
    return match ? match[1] : null;
  }

  /**
   * Generate unique ID
   */
  private generateID(): string {
    return randomBytes(16).toString('hex');
  }

  /**
   * Generate SAML timestamp
   */
  private generateTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * Start cleanup interval for expired requests
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      const now = Date.now();
      const expiration = this.config.requestIdExpirationPeriodMs || 28800000;
      
      for (const [id, info] of this.requestStore.entries()) {
        if (now - info.timestamp > expiration) {
          this.requestStore.delete(id);
        }
      }
    }, 60000); // Run every minute
  }

  /**
   * Close provider and cleanup
   */
  close(): void {
    this.requestStore.clear();
    this.removeAllListeners();
  }
}

// Factory function
export function createSAMLProvider(config: SAMLConfig): SAMLAuthProvider {
  return new SAMLAuthProvider(config);
}

export default SAMLAuthProvider;
