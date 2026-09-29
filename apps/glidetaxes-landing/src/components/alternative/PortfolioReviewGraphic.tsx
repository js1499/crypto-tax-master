import { CoinbaseMark, HyperliquidMark, SolanaMark } from "@/components/PlatformMarks";
import { CheckIcon } from "@/components/icons";
import styles from "./PortfolioReviewGraphic.module.css";

const accounts = [
  { name: "Coinbase", amount: "+$5,420.00", Mark: CoinbaseMark },
  { name: "Hyperliquid", amount: "+$4,680.60", Mark: HyperliquidMark },
  { name: "Solana", amount: "+$2,740.00", Mark: SolanaMark },
] as const;

export function PortfolioReviewGraphic() {
  return (
    <figure
      aria-label="Illustrative portfolio summary ready for a quick review"
      data-testid="portfolio-review-graphic"
      className={`legacy-method-visual-two ${styles.frame}`}
    >
      <div className={styles.card}>
        <div className={styles.header}>
          <div>
            <p className={styles.title}>Portfolio review</p>
            <p className={styles.sample}>Sample data</p>
          </div>
          <span className={styles.ready}><CheckIcon aria-hidden="true" />Ready</span>
        </div>

        <div className={styles.summary}>
          <dl>
            <dt>Net capital gain</dt>
            <dd data-testid="portfolio-review-total">+$12,840.60</dd>
          </dl>
          <div className={styles.contributions} aria-hidden="true">
            <span /><span /><span />
          </div>
        </div>

        <div className={styles.accounts}>
          <div className={styles.columnLabels} aria-hidden="true">
            <span>Account</span><span>Net gain</span>
          </div>
          <ul aria-label="Illustrative net gains by account">
            {accounts.map(({ name, amount, Mark }) => (
              <li key={name} data-portfolio-account={name}>
                <span className={styles.accountName}>
                  <span className={styles.mark} aria-hidden="true"><Mark size={30} /></span>
                  <span>{name}</span>
                </span>
                <span className={styles.amount} data-portfolio-amount={name}>{amount}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.footer}>
          <span className={styles.complete} aria-hidden="true"><CheckIcon /></span>
          <p><strong>3 accounts. One clear result.</strong><span>Ready for a quick review.</span></p>
        </div>
      </div>
    </figure>
  );
}
