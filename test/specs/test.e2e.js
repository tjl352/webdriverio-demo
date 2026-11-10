import { expect } from '@wdio/globals'
import LoginPage from '../pageobjects/login.page.js'
import SecurePage from '../pageobjects/secure.page.js'

describe('My Login application', () => {
    it('should login with valid credentials', async () => {
        await LoginPage.open()

        await LoginPage.login('tomsmith', 'SuperSecretPassword!')
        await expect(SecurePage.flashAlert).toBeExisting()
        await expect(SecurePage.flashAlert).toHaveText(
            expect.stringContaining('You logged into a secure area!'))
    })

    it('should show the alert when login is awaited', async () => {
        await LoginPage.open()

        const loggedIn = LoginPage.login('tomsmith', 'SuperSecretPassword!')
            .then(() => SecurePage.flashAlert.waitForExist())

        await loggedIn
        await expect(SecurePage.flashAlert).toBeExisting({ wait: 0 })
    })
})

